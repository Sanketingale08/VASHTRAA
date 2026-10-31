import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { InvoiceDocumentsModal } from "./InvoiceDocumentsModal";

// Mock apiFetch and getStoredToken
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  getStoredToken: vi.fn(() => "mock-token-123"),
}));

import { apiFetch } from "@/lib/api";

describe("InvoiceDocumentsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when isOpen is false", () => {
    const { container } = render(
      <InvoiceDocumentsModal
        orderId="ord-1"
        displayId="V100"
        isOpen={false}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders without runtime error when isOpen is true and loads documents", async () => {
    const mockDocuments = [
      {
        id: "inv-mos-1",
        invoiceNumber: "MOS-V100",
        documentType: "master_order_summary",
        documentTitle: "Master Order Summary",
        sellerId: null,
        sellerName: "TwirlDrape Platform",
        grandTotal: 5000,
        status: "ISSUED",
        paymentStatus: "PAID",
        paymentMethod: "UPI",
        issuedAt: "2026-10-27T10:00:00.000Z",
        downloadUrl: "/api/orders/ord-1/invoices/inv-mos-1/pdf",
        previewUrl: "/api/orders/ord-1/invoices/inv-mos-1/html",
      },
      {
        id: "inv-seller-1",
        invoiceNumber: "INV-V100-1",
        documentType: "tax_invoice",
        documentTitle: "Tax Invoice & Bill of Supply",
        sellerId: "vendor-1",
        sellerName: "Artisan Silks",
        grandTotal: 5000,
        status: "ISSUED",
        paymentStatus: "PAID",
        paymentMethod: "UPI",
        issuedAt: "2026-10-27T10:00:00.000Z",
        downloadUrl: "/api/orders/ord-1/invoices/inv-seller-1/pdf",
        previewUrl: "/api/orders/ord-1/invoices/inv-seller-1/html",
      },
    ];

    (apiFetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        documents: mockDocuments,
        isMultiVendor: false,
      }),
    });

    render(
      <InvoiceDocumentsModal
        orderId="ord-1"
        displayId="V100"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Initial loading state rendered without 'cn is not defined' error
    expect(screen.getByText("Fetching verified invoice records…")).toBeInTheDocument();

    // Wait for documents to load
    await waitFor(() => {
      expect(screen.getByText("Invoice & Tax Documents")).toBeInTheDocument();
      expect(screen.getByText("#MOS-V100")).toBeInTheDocument();
      expect(screen.getByText("#INV-V100-1")).toBeInTheDocument();
      expect(screen.getByText("Artisan Silks")).toBeInTheDocument();
    });

    // Verify Live Preview button opens iframe
    const previewButtons = screen.getAllByRole("button", { name: /Live Preview/i });
    expect(previewButtons.length).toBe(2);

    fireEvent.click(previewButtons[0]);

    // Live preview screen should now be active
    expect(screen.getByTitle("Tax Invoice Live Preview")).toBeInTheDocument();
  });

  it("handles error state gracefully when invoice fetching fails", async () => {
    (apiFetch as any).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: "Forbidden: You are not authorized to view invoices for this order",
      }),
    });

    render(
      <InvoiceDocumentsModal
        orderId="ord-2"
        displayId="V200"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText("Forbidden: You are not authorized to view invoices for this order")
      ).toBeInTheDocument();
    });
  });
});
