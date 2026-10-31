import React, { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Headphones,
  Package,
  RotateCcw,
  Store,
  Phone,
  Mail,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  Truck,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  RefreshCw,
  CreditCard,
  Building2,
  FileText,
  Loader2,
  ChevronDown,
  MessageSquare,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.06, ease: "easeOut" as const },
  }),
};

const INQUIRY_TYPES = [
  "General Inquiry",
  "Product Inquiry",
  "Order & Delivery",
  "Payment Issue",
  "Return & Refund",
  "Seller Support",
  "Other",
] as const;

// Map user inquiry type to backend CUSTOMER_TICKET_CATEGORIES
const INQUIRY_CATEGORY_MAP: Record<string, string> = {
  "General Inquiry": "Other",
  "Product Inquiry": "Product Query",
  "Order & Delivery": "Order Issue",
  "Payment Issue": "Payment Issue",
  "Return & Refund": "Return/Refund",
  "Seller Support": "Seller Complaint",
  "Other": "Other",
};

interface ContactCard {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
  email: string;
  mailto: string;
  details: { icon: React.ReactNode; label: string; value: string; href?: string }[];
  actions: { label: string; href: string; primary?: boolean }[];
}

const CONTACT_CARDS: ContactCard[] = [
  {
    id: "customer-support",
    icon: <Headphones className="w-6 h-6 transition-colors" />,
    title: "Customer Support",
    description: "For questions about orders, products, payments, returns, and general customer care.",
    badge: "24/7 Assistance",
    email: "support@vastraasaree.com",
    mailto: "mailto:support@vastraasaree.com",
    details: [
      {
        icon: <Mail className="w-4 h-4 text-[#2C3E6B]" />,
        label: "Email Support",
        value: "support@vastraasaree.com",
        href: "mailto:support@vastraasaree.com",
      },
      {
        icon: <Clock className="w-4 h-4 text-[#2C3E6B]" />,
        label: "Support Hours",
        value: "Mon–Sat, 9 AM – 7 PM IST",
      },
    ],
    actions: [
      { label: "Send Message", href: "#contact-form", primary: true },
      { label: "Email Directly", href: "mailto:support@vastraasaree.com" },
    ],
  },
  {
    id: "orders-delivery",
    icon: <Package className="w-6 h-6 transition-colors" />,
    title: "Orders & Delivery",
    description: "For real-time order tracking, delivery schedules, logistics, and shipping inquiries.",
    badge: "Express Shipping",
    email: "order@vastraasaree.com",
    mailto: "mailto:order@vastraasaree.com",
    details: [
      {
        icon: <Mail className="w-4 h-4 text-[#2C3E6B]" />,
        label: "Email Support",
        value: "order@vastraasaree.com",
        href: "mailto:order@vastraasaree.com",
      },
      {
        icon: <Truck className="w-4 h-4 text-[#2C3E6B]" />,
        label: "Dispatch Coverage",
        value: "PAN India & International",
      },
      {
        icon: <Clock className="w-4 h-4 text-[#2C3E6B]" />,
        label: "Delivery Timeline",
        value: "3 to 7 Business Days",
      },
    ],
    actions: [
      { label: "Track Order", href: "/account/orders", primary: true },
      { label: "Email Orders Desk", href: "mailto:order@vastraasaree.com" },
    ],
  },
  {
    id: "seller-support",
    icon: <Store className="w-6 h-6 transition-colors" />,
    title: "Seller Support",
    description: "For weaver onboarding, seller registration, product listings, and marketplace assistance.",
    badge: "Artisan Onboarding",
    email: "seller@vastraasaree.com",
    mailto: "mailto:seller@vastraasaree.com",
    details: [
      {
        icon: <Mail className="w-4 h-4 text-[#2C3E6B]" />,
        label: "Email Support",
        value: "seller@vastraasaree.com",
        href: "mailto:seller@vastraasaree.com",
      },
      {
        icon: <Building2 className="w-4 h-4 text-[#2C3E6B]" />,
        label: "Artisan Hub",
        value: "Direct Weaver Registration & Onboarding",
      },
      {
        icon: <Clock className="w-4 h-4 text-[#2C3E6B]" />,
        label: "Partner Hours",
        value: "Mon–Fri, 10 AM – 6 PM IST",
      },
    ],
    actions: [
      { label: "Become a Seller", href: "/seller/register", primary: true },
      { label: "Email Seller Desk", href: "mailto:seller@vastraasaree.com" },
    ],
  },
];

const FAQS = [
  {
    question: "How can I track my order?",
    answer: "You can track your order status in real-time by navigating to your Account Orders section or using your order confirmation email link. Live tracking provides complete transparency from artisan weaver dispatch to your doorstep.",
    linkText: "Track Your Order",
    linkHref: "/account/orders",
  },
  {
    question: "How can I request a return or refund?",
    answer: "To request a return or refund, visit your Account Orders page within 7 days of receiving your item. Click on 'Request Return' for the specific order. Once inspected, approved refunds are initiated within 3–5 business days.",
    linkText: "View Return Guidelines",
    linkHref: "/returns",
  },
  {
    question: "How long does delivery take?",
    answer: "Standard domestic delivery across India takes 3 to 7 business days. Handcrafted or custom Paithani weaves undergo a rigorous quality check before dispatch, which may add 1–2 business days.",
    linkText: "Read Shipping Policy",
    linkHref: "/shipping-info",
  },
  {
    question: "How can I contact a seller?",
    answer: "When you submit a query through our contact form selecting 'Product Inquiry' or providing an Order ID, our intelligent support routing automatically directs your inquiry to the relevant seller or weaver with oversight from VASTRAA support.",
    linkText: "Explore Seller Opportunities",
    linkHref: "/seller/register",
  },
  {
    question: "What should I do if my payment fails?",
    answer: "If money was deducted from your account during a failed transaction, your bank typically reverses the charge automatically within 3 to 5 business days. You can also re-attempt your payment from your Cart or contact our support team with your payment transaction ID.",
    linkText: "Submit Payment Inquiry",
    linkHref: "#contact-form",
  },
];

export default function Contact() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    subject: "",
    inquiryType: "",
    orderId: "",
    message: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Pre-fill user details if logged in
  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        fullName: prev.fullName || user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        email: prev.email || user.email || "",
      }));
    }
  }, [user]);

  function validate() {
    const errs: Record<string, string> = {};
    if (!formData.fullName.trim()) errs.fullName = "Full Name is required";
    if (!formData.email.trim()) {
      errs.email = "Email Address is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email.trim())) {
      errs.email = "Please enter a valid email address (e.g. name@example.com)";
    }
    if (!formData.subject.trim()) errs.subject = "Subject is required";
    if (!formData.inquiryType) errs.inquiryType = "Please select an Inquiry Type";
    if (!formData.message.trim()) {
      errs.message = "Message is required";
    } else if (formData.message.trim().length < 10) {
      errs.message = "Message must be at least 10 characters";
    }
    return errs;
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
    if (submitError) setSubmitError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitSuccess(null);
    setSubmitError(null);

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const backendCategory = INQUIRY_CATEGORY_MAP[formData.inquiryType] || "Other";
      const payload = {
        name: formData.fullName.trim(),
        email: formData.email.trim(),
        subject: `[${formData.inquiryType}] ${formData.subject.trim()}`,
        category: backendCategory,
        description: `Name: ${formData.fullName.trim()}\nEmail: ${formData.email.trim()}\nInquiry Type: ${formData.inquiryType}\n${formData.orderId ? `Order ID: ${formData.orderId.trim()}\n` : ""}\nMessage:\n${formData.message.trim()}`,
        orderId: formData.orderId.trim() || undefined,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Ensure user or guest identifier is provided so auth middleware accepts the inquiry
      const guestId = `guest_${formData.email.trim().toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      headers["x-user-id"] = user?.id || (user as any)?._id || guestId;

      const res = await apiFetch("/api/support/tickets", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.message || "Failed to submit inquiry. Please try again.");
      }

      const data = await res.json();
      const ticketRef = data?.id ? `#${String(data.id).slice(0, 8).toUpperCase()}` : undefined;

      setSubmitSuccess(
        `Thank you, ${formData.fullName.trim().split(" ")[0]}! Your message has been received successfully.${ticketRef ? ` Ticket Reference: ${ticketRef}.` : ""} Our support team will respond within 24 hours.`
      );

      // Clear non-account fields
      setFormData((prev) => ({
        ...prev,
        subject: "",
        inquiryType: "",
        orderId: "",
        message: "",
      }));
    } catch (err: any) {
      setSubmitError(err.message || "An unexpected error occurred while submitting your message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="bg-[#F4F5F7] min-h-screen text-[#0A1F44]">
        
        {/* ── 2. HERO SECTION ────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#0A1F44]/5 via-[#F4F5F7] to-[#F4F5F7] pt-14 pb-16 md:pt-20 md:pb-24 border-b border-[#C7CCD1]/20">
          <div className="container mx-auto px-4 relative z-10 text-center max-w-4xl">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              custom={0}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0A1F44]/8 border border-[#0A1F44]/15 mb-6"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#C7CCD1]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#0A1F44]">
                VASTRAA CUSTOMER CARE
              </span>
            </motion.div>

            <motion.h1
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              custom={1}
              className="font-serif text-4xl sm:text-5xl md:text-6xl font-bold text-[#0A1F44] tracking-tight leading-[1.15] mb-6"
            >
              We're Here to Help
            </motion.h1>

            <motion.p
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              custom={2}
              className="text-base sm:text-lg text-gray-700 max-w-2xl mx-auto leading-relaxed"
            >
              Have a question about your saree, order, delivery, or return? Our support team is here to help you enjoy a seamless VASTRAA shopping experience.
            </motion.p>
          </div>
        </section>

        {/* ── 3. CONTACT INFORMATION CARDS ──────────────────────────── */}
        <section className="container mx-auto px-4 py-16 md:py-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0A1F44]/5 text-[#0A1F44] text-[10px] font-bold uppercase tracking-widest mb-3 border border-[#0A1F44]/10">
              <Headphones className="w-3.5 h-3.5 text-[#2C3E6B]" /> Dedicated Support
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#0A1F44]">
              Dedicated Support Channels
            </h2>
            <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
              Select the relevant department below for fast, specialized assistance.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
            {CONTACT_CARDS.map((card, i) => (
              <motion.div
                key={card.id}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="bg-white rounded-2xl p-6 sm:p-7 border border-[#C7CCD1]/40 shadow-sm hover:shadow-xl hover:border-[#0A1F44]/30 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group h-full"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-[#0A1F44]/5 flex items-center justify-center border border-[#0A1F44]/10 text-[#0A1F44] group-hover:bg-[#0A1F44] group-hover:text-white group-hover:border-[#0A1F44] group-hover:scale-105 transition-all duration-300 shadow-xs">
                      {card.icon}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#0A1F44] bg-[#0A1F44]/5 px-2.5 py-1 rounded-full border border-[#0A1F44]/15 group-hover:bg-[#0A1F44]/10 group-hover:border-[#0A1F44]/25 transition-colors">
                      {card.badge}
                    </span>
                  </div>

                  <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#0A1F44] mb-2 group-hover:text-[#2C3E6B] transition-colors">
                    {card.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-gray-600 mb-5 leading-relaxed min-h-[38px]">
                    {card.description}
                  </p>

                  {/* Prominent Official Email Card with clickable mailto link */}
                  <div className="mb-5 p-3.5 rounded-xl bg-[#F4F5F7] border border-[#C7CCD1]/50 hover:border-[#0A1F44]/30 hover:bg-[#E5E8EC]/40 transition-colors">
                    <span className="block text-[10px] uppercase font-bold text-[#2C3E6B] tracking-wider mb-1 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-[#0A1F44]" /> Official Email
                    </span>
                    <a
                      href={card.mailto}
                      className="text-xs sm:text-sm font-semibold text-[#0A1F44] hover:text-[#2C3E6B] transition-colors break-all underline-offset-2 hover:underline block"
                    >
                      {card.email}
                    </a>
                  </div>

                  <ul className="space-y-3 mb-6 border-t border-gray-100 pt-4">
                    {card.details.map((detail) => (
                      <li key={detail.label} className="flex items-start gap-2.5 text-xs">
                        <span className="shrink-0 mt-0.5 text-[#2C3E6B]">{detail.icon}</span>
                        <div className="min-w-0">
                          <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                            {detail.label}
                          </span>
                          {detail.href ? (
                            <a
                              href={detail.href}
                              className="font-medium text-[#0A1F44] hover:text-[#2C3E6B] transition-colors break-all"
                            >
                              {detail.value}
                            </a>
                          ) : (
                            <span className="font-medium text-[#0A1F44]">{detail.value}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                  {card.actions.map((act) => (
                    act.href.startsWith("#") ? (
                      <a
                        key={act.label}
                        href={act.href}
                        className={cn(
                          "w-full text-center py-2.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-[0.99]",
                          act.primary
                            ? "bg-[#0A1F44] text-white hover:bg-[#163061] shadow-sm hover:shadow"
                            : "bg-[#F4F5F7] text-[#0A1F44] hover:bg-[#E5E8EC] hover:text-[#0A1F44] border border-[#C7CCD1]/50 hover:border-[#0A1F44]/30"
                        )}
                      >
                        {act.label}
                      </a>
                    ) : act.href.startsWith("mailto:") ? (
                      <a
                        key={act.label}
                        href={act.href}
                        className={cn(
                          "w-full text-center py-2.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-[0.99]",
                          act.primary
                            ? "bg-[#0A1F44] text-white hover:bg-[#163061] shadow-sm hover:shadow"
                            : "bg-[#F4F5F7] text-[#0A1F44] hover:bg-[#E5E8EC] hover:text-[#0A1F44] border border-[#C7CCD1]/50 hover:border-[#0A1F44]/30"
                        )}
                      >
                        {act.label}
                      </a>
                    ) : (
                      <Link
                        key={act.label}
                        href={act.href}
                        className={cn(
                          "w-full text-center py-2.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-[0.99]",
                          act.primary
                            ? "bg-[#0A1F44] text-white hover:bg-[#163061] shadow-sm hover:shadow"
                            : "bg-[#F4F5F7] text-[#0A1F44] hover:bg-[#E5E8EC] hover:text-[#0A1F44] border border-[#C7CCD1]/50 hover:border-[#0A1F44]/30"
                        )}
                      >
                        {act.label}
                      </Link>
                    )
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── 4. CONTACT FORM ────────────────────────────────────────── */}
        <section id="contact-form" className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-5xl mx-auto bg-white rounded-3xl border border-[#C7CCD1]/30 shadow-lg overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12">
              
              {/* Left Column: Context & Direct Info */}
              <div className="lg:col-span-4 bg-[#0A1F44] text-white p-8 md:p-10 flex flex-col justify-between relative overflow-hidden">
                <div className="relative z-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[10px] font-bold uppercase tracking-widest text-[#C7CCD1] mb-6">
                    <MessageSquare className="w-3.5 h-3.5" /> Direct Contact
                  </div>

                  <h3 className="font-serif text-2xl md:text-3xl font-bold mb-4 text-[#F4F5F7]">
                    Send Us a Message
                  </h3>

                  <p className="text-sm text-gray-300 leading-relaxed mb-8">
                    Have a detailed question or need custom assistance? Fill out the form and our support specialists will respond within 24 business hours.
                  </p>

                  <div className="space-y-6 text-xs text-gray-200 border-t border-white/15 pt-6">
                    <div className="flex items-start gap-3">
                      <Mail className="w-4 h-4 text-[#C7CCD1] shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-white uppercase text-[10px] tracking-wider mb-0.5">Email Support</p>
                        <a href="mailto:support@vastraa.com" className="hover:text-[#C7CCD1] transition-colors">
                          support@vastraa.com
                        </a>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Phone className="w-4 h-4 text-[#C7CCD1] shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-white uppercase text-[10px] tracking-wider mb-0.5">Customer Care Line</p>
                        <a href="tel:+919876543210" className="hover:text-[#C7CCD1] transition-colors">
                          +91 98765 43210
                        </a>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Clock className="w-4 h-4 text-[#C7CCD1] shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-white uppercase text-[10px] tracking-wider mb-0.5">Operating Hours</p>
                        <p>Monday – Saturday: 9:00 AM – 7:00 PM IST</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 pt-8 border-t border-white/15 mt-8">
                  <div className="flex items-center gap-2 text-xs text-[#C7CCD1]">
                    <ShieldCheck className="w-4 h-4" />
                    <span>24-Hour SLA Ticket Routing System</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Interactive Form */}
              <div className="lg:col-span-8 p-8 md:p-12">
                
                {submitSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8 p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900"
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-base text-emerald-950 mb-1">Message Sent Successfully</h4>
                        <p className="text-sm text-emerald-800 leading-relaxed mb-4">{submitSuccess}</p>
                        <button
                          onClick={() => setSubmitSuccess(null)}
                          className="text-xs font-bold text-emerald-900 hover:text-emerald-950 underline underline-offset-4"
                        >
                          Submit another inquiry
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {submitError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8 p-5 bg-red-50 border border-red-200 rounded-2xl text-red-900 flex items-start gap-3"
                  >
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-sm text-red-950 mb-0.5">Submission Failed</h4>
                      <p className="text-xs text-red-800">{submitError}</p>
                    </div>
                  </motion.div>
                )}

                <form onSubmit={handleSubmit} noValidate className="space-y-6">
                  {/* Row 1: Full Name & Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="fullName" className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-2">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="fullName"
                        type="text"
                        value={formData.fullName}
                        onChange={(e) => handleChange("fullName", e.target.value)}
                        placeholder="e.g. Ananya Sharma"
                        aria-required="true"
                        className={cn(
                          "w-full px-4 py-3 rounded-xl border text-sm bg-[#F4F5F7]/50 text-[#0A1F44] placeholder-gray-400 outline-none transition-all duration-200",
                          "focus:bg-white focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15",
                          errors.fullName ? "border-red-400 bg-red-50/20" : "border-gray-200"
                        )}
                      />
                      {errors.fullName && (
                        <p className="text-red-500 text-xs mt-1.5 font-medium">{errors.fullName}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-2">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleChange("email", e.target.value)}
                        placeholder="e.g. ananya@example.com"
                        aria-required="true"
                        className={cn(
                          "w-full px-4 py-3 rounded-xl border text-sm bg-[#F4F5F7]/50 text-[#0A1F44] placeholder-gray-400 outline-none transition-all duration-200",
                          "focus:bg-white focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15",
                          errors.email ? "border-red-400 bg-red-50/20" : "border-gray-200"
                        )}
                      />
                      {errors.email && (
                        <p className="text-red-500 text-xs mt-1.5 font-medium">{errors.email}</p>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Subject & Inquiry Type */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="subject" className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-2">
                        Subject <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="subject"
                        type="text"
                        value={formData.subject}
                        onChange={(e) => handleChange("subject", e.target.value)}
                        placeholder="Brief summary of your query"
                        aria-required="true"
                        className={cn(
                          "w-full px-4 py-3 rounded-xl border text-sm bg-[#F4F5F7]/50 text-[#0A1F44] placeholder-gray-400 outline-none transition-all duration-200",
                          "focus:bg-white focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15",
                          errors.subject ? "border-red-400 bg-red-50/20" : "border-gray-200"
                        )}
                      />
                      {errors.subject && (
                        <p className="text-red-500 text-xs mt-1.5 font-medium">{errors.subject}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="inquiryType" className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-2">
                        Inquiry Type <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select
                          id="inquiryType"
                          value={formData.inquiryType}
                          onChange={(e) => handleChange("inquiryType", e.target.value)}
                          aria-required="true"
                          className={cn(
                            "w-full appearance-none px-4 py-3 pr-10 rounded-xl border text-sm bg-[#F4F5F7]/50 text-[#0A1F44] outline-none transition-all duration-200 cursor-pointer",
                            "focus:bg-white focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15",
                            !formData.inquiryType && "text-gray-400",
                            errors.inquiryType ? "border-red-400 bg-red-50/20" : "border-gray-200"
                          )}
                        >
                          <option value="" disabled>Select an Inquiry Type</option>
                          {INQUIRY_TYPES.map((type) => (
                            <option key={type} value={type} className="text-[#0A1F44]">
                              {type}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                      {errors.inquiryType && (
                        <p className="text-red-500 text-xs mt-1.5 font-medium">{errors.inquiryType}</p>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Order ID (Optional) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="orderId" className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44]">
                        Order ID
                      </label>
                      <span className="text-[10px] text-gray-400 uppercase font-semibold">(Optional)</span>
                    </div>
                    <input
                      id="orderId"
                      type="text"
                      value={formData.orderId}
                      onChange={(e) => handleChange("orderId", e.target.value)}
                      placeholder="e.g. ORD-88921"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-[#F4F5F7]/50 text-[#0A1F44] placeholder-gray-400 outline-none transition-all duration-200 focus:bg-white focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15"
                    />
                  </div>

                  {/* Row 4: Message */}
                  <div>
                    <label htmlFor="message" className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-2">
                      Message <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="message"
                      rows={5}
                      value={formData.message}
                      onChange={(e) => handleChange("message", e.target.value)}
                      placeholder="Please share details about your question or request..."
                      aria-required="true"
                      className={cn(
                        "w-full px-4 py-3 rounded-xl border text-sm bg-[#F4F5F7]/50 text-[#0A1F44] placeholder-gray-400 outline-none transition-all duration-200 resize-none",
                        "focus:bg-white focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15",
                        errors.message ? "border-red-400 bg-red-50/20" : "border-gray-200"
                      )}
                    />
                    {errors.message && (
                      <p className="text-red-500 text-xs mt-1.5 font-medium">{errors.message}</p>
                    )}
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={cn(
                        "w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest text-white transition-all duration-300 shadow-md",
                        isSubmitting
                          ? "bg-gray-400 cursor-not-allowed"
                          : "bg-[#0A1F44] hover:bg-[#163061] active:scale-[0.98] focus:ring-2 focus:ring-[#0A1F44] focus:ring-offset-2"
                      )}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Submit Message</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>

        {/* ── 5. FREQUENTLY ASKED QUESTIONS ─────────────────────────── */}
        <section className="container mx-auto px-4 py-16 md:py-20 border-t border-[#C7CCD1]/20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="text-center mb-12 max-w-2xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0A1F44]/5 text-[#0A1F44] text-[10px] font-bold uppercase tracking-widest mb-3">
              <HelpCircle className="w-3.5 h-3.5" /> Help Center FAQs
            </div>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-[#0A1F44] mb-3">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-gray-600">
              Find quick answers to common questions regarding orders, deliveries, returns, and seller assistance.
            </p>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="w-full space-y-4">
              {FAQS.map((faq, index) => (
                <AccordionItem
                  key={faq.question}
                  value={`item-${index}`}
                  className="bg-white border border-[#C7CCD1]/30 rounded-2xl px-6 py-1 shadow-sm overflow-hidden"
                >
                  <AccordionTrigger className="text-left font-serif text-base sm:text-lg font-bold text-[#0A1F44] hover:text-[#C7CCD1] transition-colors py-4 no-underline hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-gray-600 leading-relaxed pt-1 pb-5">
                    <p className="mb-4">{faq.answer}</p>
                    {faq.linkHref.startsWith("#") ? (
                      <a
                        href={faq.linkHref}
                        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0A1F44] hover:text-[#C7CCD1] transition-colors"
                      >
                        <span>{faq.linkText}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <Link
                        href={faq.linkHref}
                        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0A1F44] hover:text-[#C7CCD1] transition-colors"
                      >
                        <span>{faq.linkText}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* ── 6. CUSTOMER SUPPORT CALL TO ACTION ─────────────────────── */}
        <section className="container mx-auto px-4 pb-20">
          <div className="max-w-5xl mx-auto bg-gradient-to-br from-[#0A1F44] via-[#0D2652] to-[#0A1F44] text-white rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden shadow-xl border border-[#C7CCD1]/30">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#C7CCD1_1px,transparent_1px)] [background-size:16px_16px]" />

            <div className="relative z-10 max-w-2xl mx-auto">
              <span className="inline-block text-[11px] font-bold uppercase tracking-[0.25em] text-[#C7CCD1] mb-3">
                ALWAYS HERE FOR YOU
              </span>

              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#F4F5F7] mb-4">
                Need More Assistance?
              </h2>

              <p className="text-sm sm:text-base text-gray-300 leading-relaxed mb-8">
                We're here to help you with your VASTRAA shopping experience. Connect directly with our concierge team through your preferred channel.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-4">
                <a
                  href="mailto:support@vastraa.com"
                  className="inline-flex items-center gap-2 bg-[#F4F5F7] text-[#0A1F44] hover:bg-white px-6 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all duration-300 shadow-md"
                >
                  <Mail className="w-4 h-4 text-[#0A1F44]" />
                  <span>Email Support</span>
                </a>

                <a
                  href="tel:+919876543210"
                  className="inline-flex items-center gap-2 bg-white/10 text-white hover:bg-white/20 border border-white/20 px-6 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all duration-300"
                >
                  <Phone className="w-4 h-4 text-[#C7CCD1]" />
                  <span>Call +91 98765 43210</span>
                </a>
              </div>
            </div>
          </div>
        </section>

      </div>
    </Layout>
  );
}
