import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminAdvertisements from "../AdminAdvertisements";

// Mock wouter
vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ["/admin/advertisements", vi.fn()],
}));

// Mock AdminLayout to isolate page functionality
vi.mock("../AdminLayout", () => ({
  default: ({ children }: any) => <div data-testid="admin-layout">{children}</div>,
  AdminGuard: ({ children }: any) => <div>{children}</div>,
}));

// Mock lucide-react icons
vi.mock("lucide-react", async () => {
  const actual = await vi.importActual<any>("lucide-react");
  return {
    ...actual,
  };
});

describe("AdminAdvertisements - Upload Workflow", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    sessionStorage.setItem("td_admin_key", "test-admin-secret");
    sessionStorage.setItem("vastraa_admin_authenticated", "true");
    sessionStorage.setItem("vastraa_admin_key", "test-admin-secret");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  function renderComponent() {
    return render(
      <QueryClientProvider client={queryClient}>
        <AdminAdvertisements />
      </QueryClientProvider>
    );
  }

  it("handles image file selection, upload execution, and renders success message & preview", async () => {
    const mockAdsList = [
      {
        id: "ad-1",
        title: "Test Ad 1",
        imageUrl: "https://r2.vastraa.com/ads/test-ad.png",
        active: true,
        priority: 1,
        clickCount: 5,
        status: "active",
      },
    ];

    const fetchMock = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes("/api/admin/advertisements") && (!options || options.method === "GET" || !options.method)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockAdsList),
        });
      }

      if (url.includes("/api/admin/upload/advertisement-image") && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              message: "Image uploaded successfully",
              publicUrl: "/api/storage/public-objects/advertisements/uploaded-test.png",
              objectKey: "advertisements/uploaded-test.png",
            }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    renderComponent();

    // 1. Open the create modal
    const createBtn = await screen.findByRole("button", { name: /New Advertisement/i });
    fireEvent.click(createBtn);

    expect(await screen.findByText("Upload New Advertisement")).toBeInTheDocument();

    // 2. Select an image file
    const file = new File(["dummy png content"], "festive-banner.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput, { target: { files: [file] } });

    // 3. Verify file card appears with name and "Upload" button
    expect(await screen.findByText("festive-banner.png")).toBeInTheDocument();
    const uploadBtn = screen.getByRole("button", { name: /^Upload$/i });
    expect(uploadBtn).toBeInTheDocument();

    // 4. Click Upload
    fireEvent.click(uploadBtn);

    // 5. Verify "Image uploaded successfully" banner appears
    expect(await screen.findByText("Image uploaded successfully")).toBeInTheDocument();

    // 6. Verify preview image is rendered with the returned publicUrl
    const previewImg = screen.getByAltText("Uploaded Banner Preview");
    expect(previewImg).toBeInTheDocument();
    expect(previewImg).toHaveAttribute(
      "src",
      "/api/storage/public-objects/advertisements/uploaded-test.png"
    );
  });

  it("displays descriptive error when image upload fails and does not show preview", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes("/api/admin/advertisements") && (!options || options.method === "GET" || !options.method)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }

      if (url.includes("/api/admin/upload/advertisement-image")) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () =>
            Promise.resolve({
              error: "Cloudflare R2 bucket connection failed: authentication rejected",
            }),
        });
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    vi.stubGlobal("fetch", fetchMock);

    renderComponent();

    const createBtn = await screen.findByRole("button", { name: /New Advertisement/i });
    fireEvent.click(createBtn);

    expect(await screen.findByText("Upload New Advertisement")).toBeInTheDocument();

    const file = new File(["dummy png content"], "banner.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput, { target: { files: [file] } });
    const uploadBtn = await screen.findByRole("button", { name: /^Upload$/i });
    fireEvent.click(uploadBtn);

    // Verify error is displayed clearly
    expect(
      await screen.findByText("Cloudflare R2 bucket connection failed: authentication rejected")
    ).toBeInTheDocument();

    // Verify preview image is NOT shown
    expect(screen.queryByAltText("Uploaded Banner Preview")).not.toBeInTheDocument();
  });

  it("prevents upload for non-image file types", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes("/api/admin/advertisements") && (!options || options.method === "GET" || !options.method)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderComponent();

    const createBtn = await screen.findByRole("button", { name: /New Advertisement/i });
    fireEvent.click(createBtn);

    expect(await screen.findByText("Upload New Advertisement")).toBeInTheDocument();

    const file = new File(["dummy text content"], "document.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(
      await screen.findByText("Only image files (JPEG, PNG, WebP, GIF, SVG) are allowed")
    ).toBeInTheDocument();
  });

  it("handles HTTP 413 payload too large error with a user-friendly message", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes("/api/admin/advertisements") && (!options || options.method === "GET" || !options.method)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }

      if (url.includes("/api/admin/upload/advertisement-image")) {
        return Promise.resolve({
          ok: false,
          status: 413,
          json: () => Promise.reject(new Error("Not JSON")),
        });
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    vi.stubGlobal("fetch", fetchMock);

    renderComponent();

    const createBtn = await screen.findByRole("button", { name: /New Advertisement/i });
    fireEvent.click(createBtn);

    expect(await screen.findByText("Upload New Advertisement")).toBeInTheDocument();

    const file = new File(["large dummy content"], "large-banner.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput, { target: { files: [file] } });
    const uploadBtn = await screen.findByRole("button", { name: /^Upload$/i });
    fireEvent.click(uploadBtn);

    expect(
      await screen.findByText("The uploaded image is too large. Please select an image under 25MB.")
    ).toBeInTheDocument();
  });

  it("validates mutual exclusivity of image sources and enforces at least one", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes("/api/admin/advertisements") && (!options || options.method === "GET" || !options.method)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderComponent();

    const createBtn = await screen.findByRole("button", { name: /New Advertisement/i });
    fireEvent.click(createBtn);

    // Submit with both sources empty
    const submitBtn = screen.getByRole("button", { name: /Create Advertisement/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText("Please upload an image or enter an image URL.")
    ).toBeInTheDocument();

    // Enter URL in Option B
    const urlInput = screen.getByPlaceholderText(/https:\/\/images\.unsplash\.com/i);
    fireEvent.change(urlInput, { target: { value: "https://example.com/saree.jpg" } });

    // Also select and upload a file in Option A
    const file = new File(["content"], "ad.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fetchMock.mockImplementation((url: string, options?: any) => {
      if (url.includes("/api/admin/upload/advertisement-image")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              publicUrl: "/api/storage/public-objects/advertisements/ad.png",
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const uploadBtn = await screen.findByRole("button", { name: /^Upload$/i });
    fireEvent.click(uploadBtn);

    await screen.findByText("Image uploaded successfully");

    // Submit with both sources active
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText("Please provide either an uploaded image or an image URL, but not both.")
    ).toBeInTheDocument();
  });
});
