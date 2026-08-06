import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  HelpCircle, Plus, ChevronLeft, Send, Clock, CheckCircle2,
  AlertCircle, XCircle, Search, ChevronDown, ChevronUp, Ticket,
  MessageSquare, Paperclip, FileText, X, ImageIcon,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type TicketStatus = "Open" | "In Progress" | "Resolved" | "Closed" | "Waiting for Customer";
type Category = string;

interface Ticket {
  id: string;
  subject: string;
  category: Category;
  status: TicketStatus;
  assignedTo: "seller" | "admin";
  escalated: boolean;
  createdAt: string;
  updatedAt: string;
  lastReplyAt: string;
}

interface Message {
  id: string;
  ticketId: string;
  userId: string;
  body: string;
  isStaff: boolean;
  createdAt: string;
  attachments?: string[];
}

interface TicketDetail extends Ticket {
  messages: Message[];
}

const FALLBACK_CATEGORIES: Category[] = [
  "Order Issue",
  "Delivery/Shipping Delay",
  "Product Quality Issue",
  "Wrong/Damaged Item",
  "Return/Refund",
  "Product Query",
  "Payment Issue",
  "Coupon/Discount Issue",
  "Account/Login Issue",
  "Website/App Technical Issue",
  "Seller Complaint",
  "Other",
];

const FAQ_ITEMS = [
  {
    q: "How do I track my order?",
    a: "Once your order is shipped, you'll receive an SMS and notification with a tracking link. You can also go to My Account → My Orders to see the live status of each order.",
  },
  {
    q: "What is the return policy?",
    a: "We accept returns within 7 days of delivery for items that are unused, unwashed, and in original packaging. To initiate a return, raise a ticket under 'Return/Refund' and our team will guide you through the process.",
  },
  {
    q: "What payment methods are accepted?",
    a: "We accept UPI, debit/credit cards (Visa, Mastercard, RuPay), net banking, and Cash on Delivery (COD) for eligible pin codes.",
  },
  {
    q: "How long does delivery take?",
    a: "Standard delivery takes 5–7 business days. Express delivery (where available) takes 2–3 business days. Delivery timelines may vary during festive seasons.",
  },
  {
    q: "Is there a COD charge?",
    a: "Yes, a convenience fee of ₹49 is applied to Cash on Delivery orders. This is clearly shown at checkout before you confirm your order.",
  },
  {
    q: "How do I use a coupon code?",
    a: "At checkout, you'll see a 'Apply Coupon' field. Enter your coupon code and click Apply. Valid coupons will automatically deduct the discount from your order total.",
  },
  {
    q: "How does the Wishlist work?",
    a: "Click the heart icon on any product to save it to your Wishlist. You can view and manage your wishlist from My Account → Wishlist. You'll also get notified when wishlisted items come back in stock.",
  },
  {
    q: "I can't sign in to my account — what should I do?",
    a: "Try resetting your password using the 'Forgot password?' link on the sign-in page. If you signed up with Google or another social login, make sure you're using the same provider. Still stuck? Raise a support ticket and we'll help you recover access.",
  },
];

function statusColor(status: TicketStatus) {
  switch (status) {
    case "Open":        return "bg-blue-50 text-blue-700 border-blue-200";
    case "In Progress": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Waiting for Customer": return "bg-amber-50 text-amber-700 border-amber-200";
    case "Resolved":    return "bg-green-50 text-green-700 border-green-200";
    case "Closed":      return "bg-gray-100 text-gray-500 border-gray-200";
    default:            return "bg-gray-50 text-gray-600 border-gray-200";
  }
}

function statusIcon(status: TicketStatus) {
  switch (status) {
    case "Open":        return <AlertCircle size={11} />;
    case "In Progress": return <Clock size={11} />;
    case "Waiting for Customer": return <Clock size={11} />;
    case "Resolved":    return <CheckCircle2 size={11} />;
    case "Closed":      return <XCircle size={11} />;
    default:            return <AlertCircle size={11} />;
  }
}

// ── File attachment helpers ───────────────────────────────────────────────────

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/");
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div className="flex items-center gap-1.5 bg-[#F3F8F5] border border-[#C9A84C]/30 rounded-lg px-2 py-1.5 text-xs max-w-[160px]">
      {preview
        ? <img src={preview} alt="" className="w-5 h-5 rounded object-cover shrink-0" />
        : <FileText size={13} className="text-[#1E6B5A] shrink-0" />}
      <span className="truncate text-gray-700">{file.name}</span>
      <button type="button" onClick={onRemove} className="shrink-0 text-gray-400 hover:text-red-500 transition-colors">
        <X size={11} />
      </button>
    </div>
  );
}

function AttachmentLinks({ attachments, base }: { attachments?: string[]; base: string }) {
  if (!attachments?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {attachments.map((path, i) => {
        const isImage = /\.(jpg|jpeg|png)$/i.test(path);
        const url = `${base}/api/storage${path}`;
        const name = decodeURIComponent(path.split("/").pop() ?? `file-${i + 1}`);
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border transition-colors bg-white/40 border-current/20 hover:bg-white/60"
          >
            {isImage ? <ImageIcon size={11} /> : <FileText size={11} />}
            <span className="max-w-[100px] truncate">{name}</span>
          </a>
        );
      })}
    </div>
  );
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

type RightPanel = "empty" | "new" | "faq" | "detail";
type MobileView = "list" | "new" | "faq" | "detail";

export function AccountSupportPage() {
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>("empty");
  const [mobileView, setMobileView] = useState<MobileView>("list");

  const [replyBody, setReplyBody] = useState("");
  const [newTicketFiles, setNewTicketFiles] = useState<File[]>([]);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [faqSearch, setFaqSearch] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [form, setForm] = useState({ subject: "", category: "" as Category | "", description: "", orderId: "" });
  const [formError, setFormError] = useState("");
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>("");
  const [ticketPage, setTicketPage] = useState(1);
  const ticketLimit = 10;

  const { data: orders = [] } = useQuery<{ id: string; createdAt: string; items?: { name?: string }[] }[]>({
    queryKey: ["support-orders"],
    queryFn: async () => {
      const r = await fetch(`/api/orders`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch orders");
      const data = await r.json();
      return data.orders ?? [];
    },
  });

  const { data: categories = FALLBACK_CATEGORIES } = useQuery<Category[]>({
    queryKey: ["support-categories"],
    queryFn: async () => {
      const r = await fetch(`/api/support/categories`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch categories");
      const data = await r.json();
      return data.categories ?? FALLBACK_CATEGORIES;
    },
  });

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery<{ tickets: Ticket[]; total: number }>({
    queryKey: ["support-tickets", ticketSearch, ticketStatusFilter, ticketPage],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(ticketPage), limit: String(ticketLimit) });
      if (ticketSearch.trim()) params.set("search", ticketSearch.trim());
      if (ticketStatusFilter) params.set("status", ticketStatusFilter);
      const r = await fetch(`/api/support/tickets?${params.toString()}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch tickets");
      return r.json();
    },
  });
  const tickets = ticketsData?.tickets ?? [];
  const ticketTotal = ticketsData?.total ?? 0;
  const ticketTotalPages = Math.max(1, Math.ceil(ticketTotal / ticketLimit));

  const { data: ticketDetail, isLoading: detailLoading } = useQuery<TicketDetail>({
    queryKey: ["support-ticket", selectedId],
    queryFn: async () => {
      const r = await fetch(`/api/support/tickets/${selectedId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch ticket");
      return r.json();
    },
    enabled: !!selectedId && (rightPanel === "detail" || mobileView === "detail"),
  });

  const createTicket = useMutation({
    mutationFn: async (data: { subject: string; category: string; description: string; orderId?: string; attachments?: string[] }) => {
      const r = await fetch(`/api/support/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to create ticket");
      }
      return r.json();
    },
    onSuccess: (ticket: Ticket) => {
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      qc.invalidateQueries({ queryKey: ["support-open-count"] });
      setForm({ subject: "", category: "", description: "", orderId: "" });
      setNewTicketFiles([]);
      setFormError("");
      setSelectedId(ticket.id);
      setRightPanel("detail");
      setMobileView("detail");
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const addReply = useMutation({
    mutationFn: async ({ body, attachments }: { body: string; attachments?: string[] }) => {
      const r = await fetch(`/api/support/tickets/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body, attachments }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to send reply");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-ticket", selectedId] });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
      setReplyBody("");
      setReplyFiles([]);
    },
  });

  const reopenTicket = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/support/tickets/${selectedId}/reopen`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to reopen ticket");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-ticket", selectedId] });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
  });

  const escalateTicket = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/support/tickets/${selectedId}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "Customer requested escalation to Super Admin" }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to escalate ticket");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-ticket", selectedId] });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
  });

  const filteredFaq = FAQ_ITEMS.filter(
    (item) =>
      !faqSearch.trim() ||
      item.q.toLowerCase().includes(faqSearch.toLowerCase()) ||
      item.a.toLowerCase().includes(faqSearch.toLowerCase())
  );

  async function uploadFiles(files: File[]): Promise<string[]> {
    return Promise.all(files.map(async (file) => {
      const res = await fetch(`/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!res.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await res.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      return objectPath as string;
    }));
  }

  function selectTicket(id: string) {
    setSelectedId(id);
    setRightPanel("detail");
    setMobileView("detail");
  }

  async function handleSubmitTicket(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.subject.trim()) { setFormError("Subject is required"); return; }
    if (!form.category) { setFormError("Please select a category"); return; }
    if (!form.description.trim()) { setFormError("Description is required"); return; }
    const totalSize = newTicketFiles.reduce((s, f) => s + f.size, 0);
    if (totalSize > MAX_TOTAL_BYTES) { setFormError("Total attachment size must be under 10 MB"); return; }

    let attachments: string[] = [];
    if (newTicketFiles.length > 0) {
      setUploadingFiles(true);
      try {
        attachments = await uploadFiles(newTicketFiles);
      } catch {
        setFormError("Failed to upload attachments — please try again.");
        setUploadingFiles(false);
        return;
      }
      setUploadingFiles(false);
    }
    createTicket.mutate({
      subject: form.subject,
      category: form.category,
      description: form.description,
      orderId: form.orderId || undefined,
      attachments,
    });
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyBody.trim() || addReply.isPending || uploadingFiles) return;
    const totalSize = replyFiles.reduce((s, f) => s + f.size, 0);
    if (totalSize > MAX_TOTAL_BYTES) return;

    let attachments: string[] = [];
    if (replyFiles.length > 0) {
      setUploadingFiles(true);
      try {
        attachments = await uploadFiles(replyFiles);
      } catch {
        setUploadingFiles(false);
        return;
      }
      setUploadingFiles(false);
    }
    addReply.mutate({ body: replyBody.trim(), attachments });
  }

  const openCount = tickets.filter((t) => t.status === "Open" || t.status === "In Progress").length;

  const TicketListPanel = (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2 mb-1">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={ticketSearch}
            onChange={(e) => { setTicketSearch(e.target.value); setTicketPage(1); }}
            placeholder="Search your tickets…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-[#C9A84C]/30 rounded-lg focus:outline-none focus:border-[#1E6B5A]/40 bg-white"
          />
        </div>
        <select
          value={ticketStatusFilter}
          onChange={(e) => { setTicketStatusFilter(e.target.value); setTicketPage(1); }}
          className="px-3 py-2 text-sm border border-[#C9A84C]/30 rounded-lg bg-white"
        >
          <option value="">All statuses</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Waiting for Customer">Waiting for Customer</option>
          <option value="Resolved">Resolved</option>
          <option value="Closed">Closed</option>
        </select>
      </div>
      {ticketsLoading ? (
        [...Array(3)].map((_, i) => (
          <div key={i} className="bg-white border border-[#C9A84C]/15 rounded-xl p-4 animate-pulse h-[72px]" />
        ))
      ) : tickets.length === 0 ? (
        <div className="bg-white border border-[#C9A84C]/20 rounded-xl p-8 text-center">
          <Ticket size={30} className="text-[#C9A84C]/40 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">No tickets yet.</p>
          <button
            onClick={() => { setRightPanel("new"); setMobileView("new"); }}
            className="mt-2 text-sm text-[#1E6B5A] font-semibold hover:underline"
          >
            Raise your first ticket →
          </button>
        </div>
      ) : (
        tickets.map((ticket) => {
          const isSelected = ticket.id === selectedId && rightPanel === "detail";
          return (
            <button
              key={ticket.id}
              onClick={() => selectTicket(ticket.id)}
              className={cn(
                "w-full text-left rounded-xl p-3.5 border transition-all group",
                isSelected
                  ? "bg-[#1E6B5A]/5 border-[#1E6B5A]/30"
                  : "bg-white border-[#C9A84C]/20 hover:border-[#C9A84C]/50 hover:shadow-sm"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className={cn(
                  "font-semibold text-sm line-clamp-1",
                  isSelected ? "text-[#1E6B5A]" : "text-[#3D1A1A] group-hover:text-[#1E6B5A] transition-colors"
                )}>
                  {ticket.subject}
                </p>
                <span className={cn(
                  "flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0",
                  statusColor(ticket.status)
                )}>
                  {statusIcon(ticket.status)}
                  {ticket.status}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                <span className="text-[#C9A84C] font-medium">{ticket.category}</span>
                <span>·</span>
                <span>Opened {relativeTime(ticket.createdAt)}</span>
                <span>·</span>
                <span>Reply {relativeTime(ticket.lastReplyAt)}</span>
              </div>
            </button>
          );
        })
      )}
      {ticketTotalPages > 1 && (
        <div className="flex items-center justify-between pt-1 text-xs text-gray-500">
          <button
            disabled={ticketPage <= 1}
            onClick={() => setTicketPage((p) => Math.max(1, p - 1))}
            className="px-2 py-1 rounded border border-[#C9A84C]/30 disabled:opacity-40"
          >
            Prev
          </button>
          <span>Page {ticketPage} of {ticketTotalPages}</span>
          <button
            disabled={ticketPage >= ticketTotalPages}
            onClick={() => setTicketPage((p) => Math.min(ticketTotalPages, p + 1))}
            className="px-2 py-1 rounded border border-[#C9A84C]/30 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );

  const NewTicketPanel = (
    <div className="bg-white border border-[#C9A84C]/20 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Plus size={16} className="text-[#1E6B5A]" />
        <h3 className="font-serif font-bold text-[#3D1A1A]">Raise a Support Ticket</h3>
      </div>
      <form onSubmit={handleSubmitTicket} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[#3D1A1A] mb-1.5 uppercase tracking-wide">
            Subject <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            placeholder="Brief description of your issue"
            className="w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1E6B5A]/50 bg-[#F3F8F5] text-[#3D1A1A] placeholder:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#3D1A1A] mb-1.5 uppercase tracking-wide">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
            className="w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1E6B5A]/50 bg-[#F3F8F5] text-[#3D1A1A]"
          >
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#3D1A1A] mb-1.5 uppercase tracking-wide">
            Related Order (optional)
          </label>
          <select
            value={form.orderId}
            onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))}
            className="w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1E6B5A]/50 bg-[#F3F8F5] text-[#3D1A1A]"
          >
            <option value="">Not related to an order</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                #{o.id.startsWith("TD") ? o.id : o.id.replace(/-/g,"").slice(0,8).toUpperCase()} — {o.items?.[0]?.name ?? "Order"}{o.items && o.items.length > 1 ? ` +${o.items.length - 1} more` : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">Linking an order routes order/product/return issues to the right seller.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#3D1A1A] mb-1.5 uppercase tracking-wide">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Please describe your issue in detail. Include order numbers if applicable."
            rows={5}
            className="w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1E6B5A]/50 bg-[#F3F8F5] text-[#3D1A1A] placeholder:text-gray-400 resize-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#3D1A1A] mb-1.5 uppercase tracking-wide">
            Attachments <span className="font-normal text-gray-400 normal-case">(optional · JPG, PNG, PDF, DOC — max 10 MB total)</span>
          </label>
          <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-[#C9A84C]/50 rounded-lg cursor-pointer hover:bg-[#F3F8F5] transition-colors">
            <Paperclip size={14} className="text-[#1E6B5A] shrink-0" />
            <span className="text-sm text-gray-400">Click to attach files…</span>
            <input
              type="file"
              className="hidden"
              accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).filter(f => ACCEPTED_TYPES.includes(f.type));
                setNewTicketFiles(prev => [...prev, ...files]);
                e.target.value = "";
              }}
            />
          </label>
          {newTicketFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {newTicketFiles.map((f, i) => (
                <FileChip key={i} file={f} onRemove={() => setNewTicketFiles(prev => prev.filter((_, j) => j !== i))} />
              ))}
            </div>
          )}
        </div>
        {formError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={createTicket.isPending}
          className="w-full py-2.5 bg-[#1E6B5A] text-white text-sm font-semibold rounded-lg hover:bg-[#5e1421] disabled:opacity-50 transition-colors"
        >
          {createTicket.isPending ? "Submitting…" : "Submit Ticket"}
        </button>
      </form>
    </div>
  );

  const FaqPanel = (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={faqSearch}
          onChange={(e) => { setFaqSearch(e.target.value); setOpenFaq(null); }}
          placeholder="Search frequently asked questions…"
          className="w-full pl-9 pr-4 py-2.5 border border-[#C9A84C]/30 rounded-xl text-sm focus:outline-none focus:border-[#1E6B5A]/40 bg-white text-[#3D1A1A] placeholder:text-gray-400 shadow-sm"
        />
      </div>
      {filteredFaq.length === 0 ? (
        <div className="bg-white border border-[#C9A84C]/20 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">No results for "{faqSearch}".</p>
        </div>
      ) : (
        filteredFaq.map((item, i) => (
          <div key={i} className="bg-white border border-[#C9A84C]/20 rounded-xl overflow-hidden shadow-sm">
            <button
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
            >
              <span className="text-sm font-semibold text-[#3D1A1A]">{item.q}</span>
              {openFaq === i
                ? <ChevronUp size={14} className="text-[#C9A84C] shrink-0" />
                : <ChevronDown size={14} className="text-gray-400 shrink-0" />
              }
            </button>
            <AnimatePresence>
              {openFaq === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <p className="px-4 pb-4 text-sm text-[#7a5f4e] leading-relaxed border-t border-[#C9A84C]/15 pt-3">
                    {item.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))
      )}
      <div className="bg-[#F3F8F5] border border-[#C9A84C]/20 rounded-xl p-4 text-center">
        <p className="text-sm text-gray-500">Can't find what you're looking for?</p>
        <button
          onClick={() => { setRightPanel("new"); setMobileView("new"); }}
          className="mt-1 text-sm font-semibold text-[#1E6B5A] hover:underline"
        >
          Raise a support ticket →
        </button>
      </div>
    </div>
  );

  const DetailPanel = (
    <div className="bg-white border border-[#C9A84C]/20 rounded-xl overflow-hidden shadow-sm">
      {detailLoading ? (
        <div className="p-10 text-center text-gray-400 text-sm animate-pulse">Loading ticket…</div>
      ) : ticketDetail ? (
        <>
          <div className="border-b border-[#C9A84C]/15 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-serif font-bold text-[#3D1A1A] text-base">{ticketDetail.subject}</p>
                <p className="text-xs text-[#C9A84C] font-medium mt-0.5">{ticketDetail.category}</p>
              </div>
              <span className={cn(
                "flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border shrink-0",
                statusColor(ticketDetail.status)
              )}>
                {statusIcon(ticketDetail.status)}
                {ticketDetail.status}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Opened {formatDateTime(ticketDetail.createdAt)}
            </p>
          </div>

          <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
            {ticketDetail.messages.map((msg) => (
              <div key={msg.id} className={cn("flex", msg.isStaff ? "justify-start" : "justify-end")}>
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                  msg.isStaff
                    ? "bg-[#F3F8F5] border border-[#C9A84C]/20 text-[#3D1A1A] rounded-tl-sm"
                    : "bg-[#1E6B5A] text-white rounded-tr-sm"
                )}>
                  {msg.isStaff && (
                    <p className="text-[10px] font-semibold text-[#C9A84C] uppercase tracking-wide mb-1">
                      Support Team
                    </p>
                  )}
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                  <AttachmentLinks attachments={msg.attachments} base={basePath} />
                  <p className={cn("text-[10px] mt-1.5", msg.isStaff ? "text-gray-400" : "text-white/60")}>
                    {formatDateTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {ticketDetail.status !== "Closed" && ticketDetail.status !== "Resolved" ? (
            <>
              <div className="border-t border-[#C9A84C]/15 p-3 space-y-2">
                <form onSubmit={handleSendReply} className="flex gap-2">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Write a reply…"
                    rows={2}
                    className="flex-1 resize-none text-sm border border-[#C9A84C]/30 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1E6B5A]/40 bg-[#F3F8F5] text-[#3D1A1A] placeholder:text-gray-400"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply(e as any);
                      }
                    }}
                  />
                  <div className="flex flex-col gap-1 shrink-0 self-end">
                    <button
                      type="submit"
                      disabled={!replyBody.trim() || addReply.isPending || uploadingFiles}
                      className="px-3 py-2 bg-[#1E6B5A] text-white rounded-lg hover:bg-[#5e1421] disabled:opacity-40 transition-colors"
                    >
                      {uploadingFiles ? <span className="text-xs">…</span> : <Send size={15} />}
                    </button>
                    <label className="px-3 py-2 text-gray-400 hover:text-[#1E6B5A] cursor-pointer rounded-lg hover:bg-[#F3F8F5] transition-colors flex justify-center" title="Attach files">
                      <Paperclip size={15} />
                      <input
                        type="file"
                        className="hidden"
                        accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []).filter(f => ACCEPTED_TYPES.includes(f.type));
                          setReplyFiles(prev => [...prev, ...files]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                </form>
                {replyFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {replyFiles.map((f, i) => (
                      <FileChip key={i} file={f} onRemove={() => setReplyFiles(prev => prev.filter((_, j) => j !== i))} />
                    ))}
                  </div>
                )}
              </div>
              {ticketDetail.assignedTo === "seller" && !ticketDetail.escalated && (
                <div className="border-t border-[#C9A84C]/15 p-3 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-gray-400">Not hearing back from the seller?</p>
                  <button
                    onClick={() => escalateTicket.mutate()}
                    disabled={escalateTicket.isPending}
                    className="text-xs font-semibold text-[#1E6B5A] hover:underline disabled:opacity-50"
                  >
                    {escalateTicket.isPending ? "Escalating…" : "Escalate to Super Admin"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="border-t border-[#C9A84C]/15 p-3 flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400">
                This ticket is {ticketDetail.status.toLowerCase()}.
              </p>
              <button
                onClick={() => reopenTicket.mutate()}
                disabled={reopenTicket.isPending}
                className="text-xs font-semibold text-[#1E6B5A] hover:underline disabled:opacity-50"
              >
                {reopenTicket.isPending ? "Reopening…" : "Reopen ticket"}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="p-10 text-center text-gray-400 text-sm">Ticket not found.</div>
      )}
    </div>
  );

  const EmptyPanel = (
    <div className="bg-white border border-[#C9A84C]/20 rounded-xl p-12 text-center">
      <MessageSquare size={36} className="text-[#C9A84C]/30 mx-auto mb-3" />
      <p className="text-gray-400 text-sm">Select a ticket to view the conversation,</p>
      <p className="text-gray-400 text-sm">or raise a new ticket.</p>
      <div className="flex justify-center gap-3 mt-4">
        <button
          onClick={() => setRightPanel("new")}
          className="px-4 py-2 bg-[#1E6B5A] text-white text-sm font-semibold rounded-lg hover:bg-[#5e1421] transition-colors"
        >
          New Ticket
        </button>
        <button
          onClick={() => { setFaqSearch(""); setRightPanel("faq"); }}
          className="px-4 py-2 border border-[#C9A84C]/40 text-[#1E6B5A] text-sm font-semibold rounded-lg hover:bg-[#F3F8F5] transition-colors"
        >
          View FAQ
        </button>
      </div>
    </div>
  );

  function renderRightPanel() {
    switch (rightPanel) {
      case "detail": return DetailPanel;
      case "new":    return NewTicketPanel;
      case "faq":    return FaqPanel;
      default:       return EmptyPanel;
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle size={20} className="text-[#1E6B5A]" />
            <h2 className="font-serif text-xl font-bold text-[#1E6B5A]">Support Center</h2>
            {openCount > 0 && (
              <span className="text-[10px] bg-[#1E6B5A] text-white font-bold px-1.5 py-0.5 rounded-full">
                {openCount} open
              </span>
            )}
          </div>
          {/* Desktop action buttons */}
          <div className="hidden md:flex gap-2">
            <button
              onClick={() => setRightPanel("new")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors",
                rightPanel === "new"
                  ? "bg-[#1E6B5A] text-white border-[#1E6B5A]"
                  : "border-[#C9A84C]/40 text-[#1E6B5A] hover:bg-[#F3F8F5]"
              )}
            >
              New Ticket
            </button>
            <button
              onClick={() => { setFaqSearch(""); setRightPanel("faq"); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors",
                rightPanel === "faq"
                  ? "bg-[#1E6B5A] text-white border-[#1E6B5A]"
                  : "border-[#C9A84C]/40 text-[#1E6B5A] hover:bg-[#F3F8F5]"
              )}
            >
              <HelpCircle size={14} /> FAQ
            </button>
          </div>
        </div>

        {/* ───── DESKTOP: Two-column layout ───── */}
        <div className="hidden md:grid md:grid-cols-[280px_1fr] gap-4 items-start">
          {/* Left: ticket list */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest px-1">
              My Tickets
            </p>
            {TicketListPanel}
          </div>

          {/* Right: content panel */}
          <AnimatePresence mode="wait">
            <motion.div
              key={rightPanel + (selectedId ?? "")}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              {renderRightPanel()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ───── MOBILE: Tabbed + back-nav layout ───── */}
        <div className="md:hidden space-y-3">
          {mobileView !== "detail" && (
            <div className="flex gap-1 bg-white border border-[#C9A84C]/20 rounded-xl p-1 shadow-sm">
              {([
                { key: "list" as MobileView, label: "My Tickets" },
                { key: "new"  as MobileView, label: "New Ticket" },
                { key: "faq"  as MobileView, label: "FAQ" },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setMobileView(key)}
                  className={cn(
                    "flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-colors",
                    mobileView === key
                      ? "bg-[#1E6B5A] text-white"
                      : "text-gray-500 hover:text-[#1E6B5A]"
                  )}
                >
                  {label}
                  {key === "list" && openCount > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[9px] rounded-full bg-white text-[#1E6B5A] font-bold">
                      {openCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={mobileView + (selectedId ?? "")}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              {mobileView === "list" && TicketListPanel}
              {mobileView === "new"  && NewTicketPanel}
              {mobileView === "faq"  && FaqPanel}
              {mobileView === "detail" && (
                <div className="space-y-3">
                  <button
                    onClick={() => setMobileView("list")}
                    className="flex items-center gap-1.5 text-sm text-[#1E6B5A] font-medium hover:underline"
                  >
                    <ChevronLeft size={15} /> Back to My Tickets
                  </button>
                  {DetailPanel}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </DashboardLayout>
  );
}
