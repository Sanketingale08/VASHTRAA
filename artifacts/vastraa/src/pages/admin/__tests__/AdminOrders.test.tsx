import React, { act } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AdminOrders from "../AdminOrders";

// Mock wouter
vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
  useLocation: () => ["/admin/orders", vi.fn()],
}));

// Mock AdminLayout
vi.mock("../AdminLayout", () => ({
  default: ({ children }: any) => <div data-testid="admin-layout">{children}</div>,
  AdminGuard: ({ children }: any) => <div>{children}</div>,
}));

// Mock InvoiceDocumentsModal
vi.mock("@/components/InvoiceDocumentsModal", () => ({
  InvoiceDocumentsModal: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="invoice-documents-modal">
        <button onClick={onClose}>Close Invoice Modal</button>
      </div>
    ) : null,
}));

const mockOrders = [
  {
    id: "ord-101",
    displayId: "V101",
    userId: "usr-456",
    customerEmail: "priya@example.com",
    address: {
      name: "Priya Sharma",
      phone: "9876543210",
      line1: "123 MG Road",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411001",
    },
    items: [
      {
        productId: "prod-1",
        name: "Pure Silk Paithani Saree",
        price: 1250000,
        quantity: 1,
        vendorName: "Yeola Silk Weavers",
        images: ["/images/saree1.jpg"],
      },
    ],
    total: 1250000,
    status: "confirmed",
    paymentMethod: "upi",
    paymentStatus: "paid",
    statusHistory: [
      { status: "confirmed", timestamp: "2026-10-28T10:00:00.000Z", note: "Order confirmed via UPI" },
    ],
    createdAt: "2026-10-28T10:00:00.000Z",
    updatedAt: "2026-10-28T10:00:00.000Z",
  },
  {
    id: "ord-102",
    displayId: "V102",
    userId: "usr-789",
    customerEmail: "rahul@example.com",
    address: {
      name: "Rahul Verma",
      phone: "9123456789",
      line1: "45 Park Street",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
    },
    items: [
      {
        productId: "prod-2",
        name: "Designer Banarasi Dupatta",
        price: 450000,
        quantity: 2,
        vendorName: "Kange Collection",
        images: ["/images/dupatta.jpg"],
      },
    ],
    total: 900000,
    status: "delivered",
    paymentMethod: "cod",
    paymentStatus: "paid",
    courierName: "Delhivery Surface",
    trackingNumber: "SR-DEL-9999",
    statusHistory: [
      { status: "confirmed", timestamp: "2026-10-25T10:00:00.000Z" },
      { status: "dispatched", timestamp: "2026-10-26T12:00:00.000Z", courierName: "Delhivery Surface", trackingNumber: "SR-DEL-9999" },
      { status: "delivered", timestamp: "2026-10-27T16:00:00.000Z" },
    ],
    createdAt: "2026-10-25T10:00:00.000Z",
    updatedAt: "2026-10-27T16:00:00.000Z",
  },
];

describe("AdminOrders Component", () => {
  beforeEach(() => {
    sessionStorage.setItem("td_admin_key", "Admin@123");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes("/api/admin/orders/ord-101")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ order: mockOrders[0], shipments: [] }),
          });
        }

        if (url.includes("/api/admin/orders/ord-101/status")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          });
        }

        if (url.includes("/api/admin/orders/ord-101/tracking")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, tracking: { courierName: "BlueDart", trackingNumber: "BD-12345" } }),
          });
        }

        if (url.includes("/api/admin/orders/ord-101/cancel")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          });
        }

        if (url.includes("/api/admin/orders")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ orders: mockOrders }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("renders metric summary cards and order records accurately", async () => {
    render(<AdminOrders />);

    await waitFor(() => {
      expect(screen.getByText("Pure Silk Paithani Saree")).toBeInTheDocument();
      expect(screen.getByText("Designer Banarasi Dupatta")).toBeInTheDocument();
    });

    // Check customer names
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("Rahul Verma")).toBeInTheDocument();

    // Check metric cards
    expect(screen.getByText("Total Orders")).toBeInTheDocument();
    expect(screen.getByText("Pending & Processing")).toBeInTheDocument();
    expect(screen.getByText("Delivered Orders")).toBeInTheDocument();
  });

  it("filters orders by status tabs", async () => {
    render(<AdminOrders />);

    await waitFor(() => {
      expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
      expect(screen.getByText("Rahul Verma")).toBeInTheDocument();
    });

    // Click "Delivered" tab
    const deliveredTab = screen.getByRole("button", { name: "Delivered" });
    fireEvent.click(deliveredTab);

    // Only Rahul Verma should be shown
    expect(screen.getByText("Rahul Verma")).toBeInTheDocument();
    expect(screen.queryByText("Priya Sharma")).not.toBeInTheDocument();

    // Click "All Orders" tab
    const allTab = screen.getByRole("button", { name: "All Orders" });
    fireEvent.click(allTab);

    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("Rahul Verma")).toBeInTheDocument();
  });

  it("opens order details modal, updates status, edits tracking, and cancels order", async () => {
    render(<AdminOrders />);

    await waitFor(() => {
      expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    });

    // Click on row to open Order Details Modal
    const row = screen.getByText("Priya Sharma").closest("tr")!;
    fireEvent.click(row);

    // Verify modal header is visible
    await waitFor(() => {
      expect(screen.getByText(/Order #V101/i)).toBeInTheDocument();
    });

    // Verify customer info in modal
    expect(screen.getByText("123 MG Road")).toBeInTheDocument();
    expect(screen.getByText(/Pune, Maharashtra - 411001/i)).toBeInTheDocument();

    // Update status to "processing"
    const statusSelect = screen.getByDisplayValue("Confirmed");
    fireEvent.change(statusSelect, { target: { value: "processing" } });

    const applyStatusBtn = screen.getByRole("button", { name: /Apply Status/i });
    fireEvent.click(applyStatusBtn);

    await waitFor(() => {
      expect(screen.getByText(/Order status successfully updated to processing/i)).toBeInTheDocument();
    });

    // Test tracking edit toggle and submission
    const editTrackingBtn = screen.getByText("+ Add Tracking Info");
    fireEvent.click(editTrackingBtn);

    const courierInput = screen.getByPlaceholderText(/e.g. Delhivery, BlueDart, DTDC/i);
    const awbInput = screen.getByPlaceholderText(/e.g. SR-DEL-10293848/i);

    fireEvent.change(courierInput, { target: { value: "BlueDart" } });
    fireEvent.change(awbInput, { target: { value: "BD-12345" } });

    const saveTrackingBtn = screen.getByRole("button", { name: /Save Tracking Info/i });
    fireEvent.click(saveTrackingBtn);

    await waitFor(() => {
      expect(screen.getByText(/Tracking details updated successfully/i)).toBeInTheDocument();
    });

    // Test cancellation workflow
    const cancelOrderBtn = screen.getByRole("button", { name: /Cancel Order/i });
    fireEvent.click(cancelOrderBtn);

    const cancelReasonInput = screen.getByPlaceholderText(/Reason for cancellation/i);
    fireEvent.change(cancelReasonInput, { target: { value: "Item discontinued by weaver" } });

    const confirmCancelBtn = screen.getByRole("button", { name: /Confirm Cancellation/i });
    fireEvent.click(confirmCancelBtn);

    await waitFor(() => {
      expect(screen.getByText(/Order cancelled successfully and inventory restored/i)).toBeInTheDocument();
    });
  });
});
