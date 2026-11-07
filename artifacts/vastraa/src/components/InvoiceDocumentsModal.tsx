import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  FileText,
  Download,
  Eye,
  CheckCircle,
  AlertCircle,
  Building2,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  ExternalLink,
  Printer,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { apiFetch, getStoredToken } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface InvoiceDocument {
  id: string;
  invoiceNumber: string;
  documentType: "master_order_summary" | "tax_invoice" | "credit_note" | string;
  documentTitle: string;
  sellerId: string | null;
  sellerName: string;
  grandTotal: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  issuedAt: string;
  downloadUrl: string;
  previewUrl: string;
}

interface InvoiceDocumentsModalProps {
  orderId: string | null;
  displayId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

export function InvoiceDocumentsModal({
  orderId,
  displayId,
  isOpen,
  onClose,
  isAdmin = false,
}: InvoiceDocumentsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<InvoiceDocument[]>([]);
  const [isMultiVendor, setIsMultiVendor] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewingDoc, setPreviewingDoc] = useState<InvoiceDocument | null>(null);
  const [iframeLoading, setIframeLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isOpen || !orderId) {
      setPreviewingDoc(null);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError(null);

    const headers: Record<string, string> = {};
    if (isAdmin) {
      const adminKey =
        sessionStorage.getItem("td_admin_key") ||
        localStorage.getItem("td_admin_key") ||
        "dev-admin-key";
      headers["x-admin-key"] = adminKey;
    }

    const fetchPromise = isAdmin
      ? fetch(`/api/orders/${orderId}/invoices`, { headers, credentials: "include" })
      : apiFetch(`/api/orders/${orderId}/invoices`);

    fetchPromise
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to fetch invoice documents (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        setDocuments(data.documents || []);
        setIsMultiVendor(Boolean(data.isMultiVendor));
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || "Failed to load invoice documents");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, orderId, isAdmin]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (previewingDoc) {
          setPreviewingDoc(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, previewingDoc, onClose]);

  function getResolvedPreviewUrl(doc: InvoiceDocument): string {
    const token = getStoredToken();
    const adminKey = isAdmin
      ? sessionStorage.getItem("td_admin_key") ||
        localStorage.getItem("td_admin_key") ||
        "dev-admin-key"
      : null;
    let url = doc.previewUrl;
    if (adminKey) {
      url += (url.includes("?") ? "&" : "?") + `adminKey=${encodeURIComponent(adminKey)}`;
    } else if (token) {
      url += (url.includes("?") ? "&" : "?") + `token=${encodeURIComponent(token)}`;
    }
    return url;
  }

  async function handleDownload(doc: InvoiceDocument) {
    setDownloadingId(doc.id);
    try {
      const headers: Record<string, string> = {};
      if (isAdmin) {
        const adminKey =
          sessionStorage.getItem("td_admin_key") ||
          localStorage.getItem("td_admin_key") ||
          "dev-admin-key";
        headers["x-admin-key"] = adminKey;
      }

      const res = isAdmin
        ? await fetch(doc.downloadUrl, { headers, credentials: "include" })
        : await apiFetch(doc.downloadUrl);

      if (!res.ok) {
        throw new Error(`Download failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice-${doc.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "Unable to download PDF. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  }

  function handleOpenInNewTab(doc: InvoiceDocument) {
    const url = getResolvedPreviewUrl(doc);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handlePreview(doc: InvoiceDocument) {
    setPreviewingDoc(doc);
    setIframeLoading(true);
  }

  function handlePrintIframe() {
    try {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
      }
    } catch {
      if (previewingDoc) {
        handleOpenInNewTab(previewingDoc);
      }
    }
  }

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "relative w-full bg-white dark:bg-[#1E2329] rounded-xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col transition-all duration-300",
            previewingDoc ? "max-w-5xl h-[95vh] sm:h-[92vh]" : "max-w-2xl max-h-[92vh] sm:max-h-[90vh]"
          )}
        >
          {previewingDoc ? (
            /* ── Interactive Live Invoice Preview Viewer ── */
            <div className="flex flex-col h-full bg-[#E2E8F0] dark:bg-[#15191E]">
              {/* Preview Header Toolbar */}
              <div className="px-3 sm:px-5 py-2.5 sm:py-3.5 bg-[#0A1F44] text-white flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 shadow-md shrink-0 border-b border-[#0A1F44]/50">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <button
                    onClick={() => setPreviewingDoc(null)}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition flex items-center gap-1.5 text-xs font-semibold"
                    title="Back to all documents"
                  >
                    <ArrowLeft size={14} />
                    <span>Back</span>
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#B8912A]/30 text-[#F6EFD9] border border-[#B8912A]/50">
                        {previewingDoc.documentType === "master_order_summary"
                          ? "Master Summary"
                          : previewingDoc.documentType === "credit_note"
                          ? "Credit Note"
                          : "Tax Invoice"}
                      </span>
                      <span className="font-mono text-xs font-bold text-white truncate">
                        #{previewingDoc.invoiceNumber}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-300 truncate mt-0.5">
                      {previewingDoc.sellerName} · ₹{Number(previewingDoc.grandTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    onClick={handlePrintIframe}
                    className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition border border-white/20 min-h-[34px] sm:min-h-0"
                    title="Print document or save as PDF"
                  >
                    <Printer size={13} />
                    <span>Print</span>
                  </button>

                  <button
                    onClick={() => handleOpenInNewTab(previewingDoc)}
                    className="inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition border border-white/20 min-h-[34px] sm:min-h-0"
                    title="Open preview in a new browser tab"
                  >
                    <ExternalLink size={13} />
                    <span className="hidden sm:inline">New Tab</span>
                  </button>

                  <button
                    onClick={() => handleDownload(previewingDoc)}
                    disabled={downloadingId === previewingDoc.id}
                    className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#B8912A] hover:bg-[#A37E20] text-white text-xs font-bold transition shadow-sm disabled:opacity-50 min-h-[34px] sm:min-h-0"
                    title="Download official A4 PDF"
                  >
                    <Download size={13} className={downloadingId === previewingDoc.id ? "animate-bounce" : ""} />
                    <span>{downloadingId === previewingDoc.id ? "PDF…" : "Download PDF"}</span>
                  </button>

                  <button
                    onClick={() => setPreviewingDoc(null)}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition ml-0.5 sm:ml-1"
                    title="Close preview"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Iframe Live Render Container */}
              <div className="relative flex-1 w-full overflow-hidden bg-[#E2E8F0] dark:bg-[#15191E]">
                {iframeLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#E2E8F0]/80 dark:bg-[#15191E]/80 backdrop-blur-xs z-10 text-gray-600 dark:text-gray-300">
                    <Loader2 size={28} className="animate-spin text-[#0A1F44] dark:text-[#B8912A]" />
                    <p className="text-xs font-semibold">Rendering official document preview…</p>
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  src={getResolvedPreviewUrl(previewingDoc)}
                  onLoad={() => setIframeLoading(false)}
                  className="w-full h-full border-0"
                  title="Tax Invoice Live Preview"
                />
              </div>
            </div>
          ) : (
            /* ── Document List View ── */
            <>
              {/* Header */}
              <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white dark:from-[#252B33] dark:to-[#1E2329]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0A1F44]/5 dark:bg-[#0A1F44]/20 border border-[#0A1F44]/15 flex items-center justify-center text-[#0A1F44] dark:text-[#C7CCD1]">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-bold text-[#0A1F44] dark:text-white flex items-center gap-2">
                      Invoice &amp; Tax Documents
                      {isMultiVendor && (
                        <span className="text-[11px] font-sans font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          Multi-Seller Order
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Order #{displayId || orderId} · Official GST compliant documentation
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-4">
                {loading ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-gray-400">
                    <div className="w-8 h-8 border-2 border-[#0A1F44] border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs font-medium">Fetching verified invoice records…</p>
                  </div>
                ) : error ? (
                  <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-400 text-xs flex items-center gap-3">
                    <AlertCircle size={18} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : documents.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 text-xs">
                    No invoices found for this order.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {isMultiVendor && (
                      <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
                        <ShieldCheck size={16} className="shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                        <div>
                          <p className="font-semibold">Independent Statutory Invoices</p>
                          <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                            In accordance with Indian GST marketplace regulations, a <strong>Master Order Summary</strong> provides your complete checkout overview, while each registered seller issues an independent <strong>Tax Invoice &amp; Bill of Supply</strong> for their respective handcrafted goods.
                          </p>
                        </div>
                      </div>
                    )}

                    {documents.map((doc) => {
                      const isMOS = doc.documentType === "master_order_summary";
                      const isCN = doc.documentType === "credit_note";
                      const isTaxInvoice = doc.documentType === "tax_invoice";

                      const badgeColor = isMOS
                        ? "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                        : isCN
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";

                      const badgeText = isMOS
                        ? "Master Summary"
                        : isCN
                        ? "Credit Note"
                        : "Seller Tax Invoice";

                      return (
                        <div
                          key={doc.id}
                          className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#252B33] hover:border-gray-300 dark:hover:border-gray-700 transition shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeColor}`}>
                                {badgeText}
                              </span>
                              <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">
                                #{doc.invoiceNumber}
                              </span>
                              <span className="text-[11px] text-gray-400">
                                · {new Date(doc.issuedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                            </div>

                            <p className="text-sm font-semibold text-[#0A1F44] dark:text-white flex items-center gap-1.5 pt-0.5">
                              <Building2 size={13} className="text-gray-400 shrink-0" />
                              <span>{doc.sellerName}</span>
                            </p>

                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {isMOS
                                ? "Complete customer-facing summary covering all checkout items and charges."
                                : isCN
                                ? "Official GST adjustment document referencing original tax invoice."
                                : `GST Tax Invoice & Bill of Supply covering products fulfilled by ${doc.sellerName}.`}
                            </p>
                          </div>

                          <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-800">
                            <div className="text-left sm:text-right">
                              <p className="text-[11px] text-gray-400 font-medium">Total Amount</p>
                              <p className="text-sm font-bold text-[#0A1F44] dark:text-white">
                                ₹{Number(doc.grandTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handlePreview(doc)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-[#0A1F44]/20 dark:border-gray-700 text-[#0A1F44] dark:text-gray-200 hover:bg-[#0A1F44]/5 dark:hover:bg-gray-800 transition"
                                title="Live preview invoice in this window"
                              >
                                <Eye size={12} />
                                Live Preview
                              </button>
                              <button
                                onClick={() => handleOpenInNewTab(doc)}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                                title="Open preview in new tab"
                              >
                                <ExternalLink size={13} />
                              </button>
                              <button
                                onClick={() => handleDownload(doc)}
                                disabled={downloadingId === doc.id}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg bg-[#0A1F44] hover:bg-[#1E2E4A] text-white transition shadow-2xs disabled:opacity-50"
                                title="Download official A4 PDF"
                              >
                                <Download size={12} className={downloadingId === doc.id ? "animate-bounce" : ""} />
                                {downloadingId === doc.id ? "PDF…" : "PDF"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#1E2329] flex items-center justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <ShieldCheck size={13} className="text-emerald-600" />
                  VASTRAA Standardized Template System
                </span>
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
