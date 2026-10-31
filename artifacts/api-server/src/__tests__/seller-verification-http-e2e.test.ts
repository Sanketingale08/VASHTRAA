import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../app";
import nodemailer from "nodemailer";
import { mongoSellers } from "@workspace/db";

describe("Seller Registration Verification HTTP API — E2E Flow", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("1. Rejects invalid email on /api/seller/send-verification-code with 400", async () => {
    const res = await request(app)
      .post("/api/seller/send-verification-code")
      .send({ email: "invalid-email" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Please enter a valid email address.");
  });

  it("2. Returns 409 if seller email already exists in mongoSellers", async () => {
    vi.spyOn(mongoSellers, "findByEmail").mockResolvedValueOnce({
      id: "vend_999",
      email: "alreadyregistered@example.com",
    } as any);

    const res = await request(app)
      .post("/api/seller/send-verification-code")
      .send({ email: "alreadyregistered@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already exists. Please sign in instead");
  });

  it("3. Sends code successfully via SMTP and returns success with 200", async () => {
    process.env.SMTP_HOST = "smtp.test-server.local";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "test@vastraa.com";
    process.env.SMTP_PASS = "secret123";

    const mockSendMail = vi.fn().mockResolvedValueOnce({
      messageId: "test-msg-id-12345",
    });
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: mockSendMail,
    } as any);

    const res = await request(app)
      .post("/api/seller/send-verification-code")
      .send({ email: "newseller-e2e@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain("Verification code sent successfully");
    expect(mockSendMail).toHaveBeenCalledOnce();

    // Verify SMTP call details without logging secret
    const sendArgs = mockSendMail.mock.calls[0][0];
    expect(sendArgs.to).toBe("newseller-e2e@example.com");
    expect(sendArgs.subject).toContain("Seller Registration Verification Code");
    expect(sendArgs.html).toContain("VASTRAA");
  });

  it("4. Returns 400 with safe error message if SMTP delivery fails", async () => {
    process.env.SMTP_HOST = "smtp.broken-server.local";
    delete process.env.RESEND_API_KEY;

    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: vi.fn().mockRejectedValueOnce(new Error("Connection refused")),
    } as any);

    const res = await request(app)
      .post("/api/seller/send-verification-code")
      .send({ email: "fail-seller@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Unable to send the verification code. Please try again.");
    expect(res.body.success).toBeUndefined();
  });

  it("5. Completes send -> verify flow successfully", async () => {
    const testEmail = "e2e-flow@example.com";
    const sendRes = await request(app)
      .post("/api/seller/send-verification-code")
      .send({ email: testEmail });

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.devCode).toBeDefined();
    const code = sendRes.body.devCode;

    // Verify with bad code first
    const badVerify = await request(app)
      .post("/api/seller/verify-email")
      .send({ email: testEmail, code: "000000" });

    expect(badVerify.status).toBe(400);
    expect(badVerify.body.error).toContain("Invalid verification code");

    // Verify with correct code
    const goodVerify = await request(app)
      .post("/api/seller/verify-email")
      .send({ email: testEmail, code });

    expect(goodVerify.status).toBe(200);
    expect(goodVerify.body.success).toBe(true);
    expect(goodVerify.body.message).toContain("Email verified successfully");
  });
});
