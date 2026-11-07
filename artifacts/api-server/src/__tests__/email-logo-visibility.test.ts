import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";
import {
  wrapInTemplate,
  getEmailLogoUrl,
  getLogoPngPath,
  getVastraaLogoAttachment,
} from "../lib/transactionalEmail";

describe("Vastraa Email Template Logo Visibility", () => {
  it("renders a high-contrast luxury white badge container for the Vastraa logo in wrapInTemplate", () => {
    const html = wrapInTemplate("Order Confirmed", "<p>Your order has been placed.</p>");

    // Brand and logo assertions
    expect(html).toContain("alt=\"VASTRAA\"");
    expect(html).toContain("background-color:#3B1254"); // Royal Imperial Purple header
    expect(html).toContain("background-color:#FFFFFF"); // White container for logo contrast
    expect(html).toContain("border:1px solid #D4AF37"); // Luxury Gold border
    expect(html).toContain("border-radius:12px"); // Polished rounded pill/badge
    expect(html).toContain("<img");
    expect(html).toContain("The Art of Indian Drape");
    // Header section has the Vastraa logo and no plain text heading name
    expect(html).not.toContain("<h1");
  });

  it("resolves the local logo PNG file on disk for attachments", () => {
    const logoPath = getLogoPngPath();
    expect(logoPath).toBeDefined();
    expect(logoPath).toContain("logo.png");

    const attachment = getVastraaLogoAttachment();
    expect(attachment).not.toBeNull();
    expect(attachment?.filename).toBe("vastraa-logo.png");
    expect(attachment?.cid).toBe("vastraa-logo");
    expect(attachment?.contentType).toBe("image/png");
  });

  it("respects EMAIL_LOGO_URL and custom logoUrl options", () => {
    const customCdnUrl = "https://cdn.vastraasaree.com/assets/logo.png";
    const html = wrapInTemplate("Subject", "<p>Test</p>", { logoUrl: customCdnUrl });
    expect(html).toContain(customCdnUrl);
  });

  it("serves the logo PNG via backend static endpoints /logo.png and /api/logo.png", async () => {
    const res1 = await request(app).get("/logo.png");
    expect([200, 304]).toContain(res1.status);
    expect(res1.headers["content-type"]).toContain("image/png");

    const res2 = await request(app).get("/api/logo.png");
    expect([200, 304]).toContain(res2.status);
    expect(res2.headers["content-type"]).toContain("image/png");
  });

  it("weekly admin report template header replaces text name with Vastraa logo", async () => {
    const { buildReportEmail } = await import("../workers/weeklyAdminReport");
    const sampleKpis = {
      grossRevenue: 50000,
      totalOrders: 10,
      newCustomers: 5,
      returnRate: 0,
      lowStockCount: 2,
      pendingSettlementAmount: 10000,
      periodStart: "2026-11-01",
      periodEnd: "2026-11-07",
    };
    const report = buildReportEmail(sampleKpis);
    expect(report.html).toContain("<img");
    expect(report.html).toContain("alt=\"VASTRAA\"");
    expect(report.html).not.toContain("<h1");
  });
});
