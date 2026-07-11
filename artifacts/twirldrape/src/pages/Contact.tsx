import React, { useState, useRef } from "react";
import { Layout } from "@/components/Layout";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Phone, Mail, Clock,
  Instagram, Facebook, Youtube, Twitter, Linkedin,
  Package, RotateCcw, CreditCard, Truck, AlertCircle,
  XCircle, Star, Store, Send, Paperclip, CheckCircle2,
  Users, Gift, Globe, ShoppingBag, HeadphonesIcon, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: "easeOut" },
  }),
};

const CATEGORIES = [
  "General Inquiry",
  "Product Inquiry",
  "Order Support",
  "Return & Refund",
  "Shipping",
  "Vendor Registration",
  "Bulk Orders",
  "Technical Support",
  "Partnership",
  "Complaint",
];

const CONTACT_CARDS = [
  {
    icon: <HeadphonesIcon size={24} />,
    title: "Customer Support",
    color: "from-[#1E6B5A]/10 to-[#1E6B5A]/5",
    border: "border-[#1E6B5A]/20",
    iconBg: "bg-[#1E6B5A]",
    items: [
      { icon: <Phone size={14} />, label: "Phone", value: "+91 98765 43210" },
      { icon: <Mail size={14} />, label: "Email", value: "support@twirldrape.com" },
      { icon: <Clock size={14} />, label: "Hours", value: "Mon–Sat, 9 AM – 7 PM IST" },
    ],
  },
  {
    icon: <Store size={24} />,
    title: "Sales & Business",
    color: "from-[#C9A84C]/10 to-[#C9A84C]/5",
    border: "border-[#C9A84C]/30",
    iconBg: "bg-[#C9A84C]",
    items: [
      { icon: <Mail size={14} />, label: "Business", value: "sales@twirldrape.com" },
      { icon: <Mail size={14} />, label: "Vendors", value: "vendors@twirldrape.com" },
    ],
  },
  {
    icon: <Globe size={24} />,
    title: "Social Media",
    color: "from-[#1E6B5A]/10 to-[#C9A84C]/5",
    border: "border-[#C9A84C]/20",
    iconBg: "bg-gradient-to-br from-[#1E6B5A] to-[#C9A84C]",
    items: [],
    social: [
      { icon: <Instagram size={18} />, label: "Instagram", href: "https://www.instagram.com/twirldrape/", color: "hover:text-[#E1306C]" },
      { icon: <Facebook size={18} />, label: "Facebook", href: "https://www.facebook.com/twirldrape", color: "hover:text-[#1877F2]" },
      { icon: <Youtube size={18} />, label: "YouTube", href: "https://www.youtube.com/@twirldrape", color: "hover:text-[#FF0000]" },
      { icon: <Twitter size={18} />, label: "X (Twitter)", href: "https://twitter.com/twirldrape", color: "hover:text-[#1DA1F2]" },
      { icon: <Linkedin size={18} />, label: "LinkedIn", href: "https://www.linkedin.com/company/twirldrape", color: "hover:text-[#0A66C2]" },
    ],
  },
];

const QUICK_SUPPORT = [
  { icon: <Package size={20} />, label: "Track My Order", href: "/track-order" },
  { icon: <RotateCcw size={20} />, label: "Return Request", href: "/account/orders" },
  { icon: <CreditCard size={20} />, label: "Refund Status", href: "/account/orders" },
  { icon: <Truck size={20} />, label: "Shipping Information", href: "#shipping" },
  { icon: <AlertCircle size={20} />, label: "Payment Issues", href: "#payment" },
  { icon: <XCircle size={20} />, label: "Cancel Order", href: "/account/orders" },
  { icon: <Star size={20} />, label: "Product Quality Issue", href: "#quality" },
  { icon: <Store size={20} />, label: "Contact Seller", href: "#seller" },
];

const BULK_TYPES = [
  { icon: "💍", title: "Wedding Orders", desc: "Curated sets for the entire wedding party" },
  { icon: "🏪", title: "Boutique Orders", desc: "Wholesale stock for retail boutiques" },
  { icon: "🎁", title: "Corporate Gifts", desc: "Branded gifting for companies & events" },
  { icon: "🌍", title: "Export Inquiry", desc: "International bulk shipments available" },
  { icon: "🧵", title: "Wholesale Sarees", desc: "Direct-from-weaver pricing at scale" },
];

export default function Contact() {
  const [formData, setFormData] = useState({
    name: "", email: "", mobile: "", subject: "", category: "", message: "",
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  function validate() {
    const e: Record<string, string> = {};
    if (!formData.name.trim()) e.name = "Full name is required";
    if (!formData.email.trim() || !/\S+@\S+\.\S+/.test(formData.email)) e.email = "Valid email is required";
    if (!formData.mobile.trim() || !/^\+?[0-9\s\-]{8,15}$/.test(formData.mobile)) e.mobile = "Valid mobile number is required";
    if (!formData.subject.trim()) e.subject = "Subject is required";
    if (!formData.category) e.category = "Please select a category";
    if (!formData.message.trim() || formData.message.trim().length < 10) e.message = "Message must be at least 10 characters";
    return e;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSubmitted(true);
  }

  function handleChange(field: string, val: string) {
    setFormData(prev => ({ ...prev, [field]: val }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  return (
    <Layout>
      <div className="bg-[#F3F8F5] min-h-screen">

        {/* ── Contact Information Cards ──────────────────────────────── */}
        <section className="container mx-auto px-4 py-16 md:py-20">
          <motion.div
            custom={0}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="text-center mb-12"
          >
            <p className="text-[#C9A84C] uppercase tracking-[0.3em] text-xs font-bold mb-3">Reach Us</p>
            <h2 className="font-serif text-3xl md:text-4xl text-[#1E6B5A] font-bold">Contact Information</h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {CONTACT_CARDS.map((card, i) => (
              <motion.div
                key={card.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className={cn(
                  "bg-gradient-to-br rounded-2xl p-6 border shadow-sm hover:shadow-md transition-shadow duration-300",
                  card.color, card.border
                )}
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0", card.iconBg)}>
                    {card.icon}
                  </div>
                  <h3 className="font-semibold text-[#3D1515] text-base">{card.title}</h3>
                </div>

                {card.items.length > 0 && (
                  <ul className="space-y-3 mb-4">
                    {card.items.map((item) => (
                      <li key={item.label} className="flex items-start gap-2.5">
                        <span className="text-[#C9A84C] mt-0.5 shrink-0">{item.icon}</span>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#7a5f4e] mb-0.5">{item.label}</p>
                          <p className="text-sm text-[#3D1515]">{item.value}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {card.social && (
                  <div className="flex flex-wrap gap-3 mt-2">
                    {card.social.map((s) => (
                      <a
                        key={s.label}
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={s.label}
                        className={cn("text-[#7a5f4e] transition-colors", s.color)}
                      >
                        {s.icon}
                      </a>
                    ))}
                  </div>
                )}

                {card.cta && (
                  <a
                    href={card.cta.href}
                    target={card.cta.href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1E6B5A] hover:text-[#C9A84C] transition-colors border-b border-[#1E6B5A]/30 hover:border-[#C9A84C] pb-0.5"
                  >
                    {card.cta.label} →
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Quick Support ──────────────────────────────────────────── */}
        <section className="bg-[#E6F0EA] py-16 md:py-20">
          <div className="container mx-auto px-4">
            <motion.div
              custom={0}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center mb-12"
            >
              <p className="text-[#C9A84C] uppercase tracking-[0.3em] text-xs font-bold mb-3">Quick Help</p>
              <h2 className="font-serif text-3xl md:text-4xl text-[#1E6B5A] font-bold">Customer Support</h2>
              <p className="mt-3 text-[#7a5f4e] text-sm max-w-md mx-auto">Find quick answers to the most common questions.</p>
            </motion.div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {QUICK_SUPPORT.map((item, i) => (
                <motion.div
                  key={item.label}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                >
                  <Link
                    href={item.href}
                    className="group flex flex-col items-center gap-3 p-5 bg-white rounded-2xl border border-[#C9A84C]/20 hover:border-[#C9A84C]/60 hover:shadow-md transition-all duration-300 text-center"
                  >
                    <div className="w-12 h-12 rounded-xl bg-[#1E6B5A]/8 group-hover:bg-[#1E6B5A] flex items-center justify-center text-[#1E6B5A] group-hover:text-white transition-all duration-300">
                      {item.icon}
                    </div>
                    <p className="text-sm font-semibold text-[#3D1515] group-hover:text-[#1E6B5A] transition-colors leading-tight">
                      {item.label}
                    </p>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Contact Form ──────────────────────────────────────────── */}
        <section id="contact-form" className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto">
            <motion.div
              custom={0}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center mb-12"
            >
              <p className="text-[#C9A84C] uppercase tracking-[0.3em] text-xs font-bold mb-3">Write to Us</p>
              <h2 className="font-serif text-3xl md:text-4xl text-[#1E6B5A] font-bold">Send a Message</h2>
              <p className="mt-3 text-[#7a5f4e] text-sm max-w-md mx-auto">
                Fill in the form and our team will get back to you within 24 hours on business days.
              </p>
            </motion.div>

            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="bg-white rounded-2xl border border-[#C9A84C]/30 shadow-sm p-12 text-center"
              >
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={32} className="text-green-600" />
                </div>
                <h3 className="font-serif text-2xl text-[#1E6B5A] font-bold mb-3">Message Sent!</h3>
                <p className="text-[#7a5f4e] mb-6 max-w-sm mx-auto">
                  Thank you for reaching out. Our support team will respond within 24 hours.
                </p>
                <button
                  onClick={() => { setSubmitted(false); setFormData({ name: "", email: "", mobile: "", subject: "", category: "", message: "" }); setAttachment(null); }}
                  className="inline-flex items-center gap-2 bg-[#1E6B5A] text-white px-6 py-3 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-[#5e1421] transition-colors"
                >
                  Send Another Message
                </button>
              </motion.div>
            ) : (
              <motion.form
                custom={1}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                onSubmit={handleSubmit}
                className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm p-8 md:p-10 space-y-6"
              >
                {/* Row 1: Name + Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#3D1515] mb-2">
                      Full Name <span className="text-[#1E6B5A]">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      placeholder="Priya Sharma"
                      className={cn(
                        "w-full px-4 py-3 rounded-lg border bg-[#F3F8F5] text-sm text-[#3D1515] placeholder-[#b5a08a] outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/20 transition",
                        errors.name ? "border-red-400" : "border-[#C9A84C]/30"
                      )}
                    />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#3D1515] mb-2">
                      Email Address <span className="text-[#1E6B5A]">*</span>
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      placeholder="priya@example.com"
                      className={cn(
                        "w-full px-4 py-3 rounded-lg border bg-[#F3F8F5] text-sm text-[#3D1515] placeholder-[#b5a08a] outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/20 transition",
                        errors.email ? "border-red-400" : "border-[#C9A84C]/30"
                      )}
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                  </div>
                </div>

                {/* Row 2: Mobile + Subject */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#3D1515] mb-2">
                      Mobile Number <span className="text-[#1E6B5A]">*</span>
                    </label>
                    <input
                      type="tel"
                      value={formData.mobile}
                      onChange={(e) => handleChange("mobile", e.target.value)}
                      placeholder="+91 98765 43210"
                      className={cn(
                        "w-full px-4 py-3 rounded-lg border bg-[#F3F8F5] text-sm text-[#3D1515] placeholder-[#b5a08a] outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/20 transition",
                        errors.mobile ? "border-red-400" : "border-[#C9A84C]/30"
                      )}
                    />
                    {errors.mobile && <p className="text-red-500 text-xs mt-1">{errors.mobile}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#3D1515] mb-2">
                      Subject <span className="text-[#1E6B5A]">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.subject}
                      onChange={(e) => handleChange("subject", e.target.value)}
                      placeholder="Briefly describe your query"
                      className={cn(
                        "w-full px-4 py-3 rounded-lg border bg-[#F3F8F5] text-sm text-[#3D1515] placeholder-[#b5a08a] outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/20 transition",
                        errors.subject ? "border-red-400" : "border-[#C9A84C]/30"
                      )}
                    />
                    {errors.subject && <p className="text-red-500 text-xs mt-1">{errors.subject}</p>}
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#3D1515] mb-2">
                    Category <span className="text-[#1E6B5A]">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={formData.category}
                      onChange={(e) => handleChange("category", e.target.value)}
                      className={cn(
                        "w-full appearance-none px-4 py-3 pr-10 rounded-lg border bg-[#F3F8F5] text-sm text-[#3D1515] outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/20 transition cursor-pointer",
                        errors.category ? "border-red-400" : "border-[#C9A84C]/30",
                        !formData.category && "text-[#b5a08a]"
                      )}
                    >
                      <option value="" disabled>Select a category</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a5f4e] pointer-events-none" />
                  </div>
                  {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category}</p>}
                </div>

                {/* Message */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#3D1515] mb-2">
                    Message <span className="text-[#1E6B5A]">*</span>
                  </label>
                  <textarea
                    value={formData.message}
                    onChange={(e) => handleChange("message", e.target.value)}
                    rows={5}
                    placeholder="Describe your query in detail…"
                    className={cn(
                      "w-full px-4 py-3 rounded-lg border bg-[#F3F8F5] text-sm text-[#3D1515] placeholder-[#b5a08a] outline-none focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/20 transition resize-none",
                      errors.message ? "border-red-400" : "border-[#C9A84C]/30"
                    )}
                  />
                  {errors.message && <p className="text-red-500 text-xs mt-1">{errors.message}</p>}
                </div>

                {/* Attachment */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#3D1515] mb-2">
                    Attachment <span className="text-[#7a5f4e] font-normal normal-case tracking-normal">(optional)</span>
                  </label>
                  <input
                    type="file"
                    ref={fileRef}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-[#C9A84C]/50 rounded-lg text-sm text-[#7a5f4e] hover:border-[#C9A84C] hover:text-[#1E6B5A] transition-colors bg-[#F3F8F5]"
                  >
                    <Paperclip size={15} className="text-[#C9A84C]" />
                    {attachment ? attachment.name : "Attach a file (image, PDF, doc)"}
                  </button>
                  {attachment && (
                    <button
                      type="button"
                      onClick={() => { setAttachment(null); if (fileRef.current) fileRef.current.value = ""; }}
                      className="mt-1 text-xs text-red-500 hover:text-red-700 transition-colors"
                    >
                      Remove attachment
                    </button>
                  )}
                </div>

                {/* Submit */}
                <div className="pt-2">
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#C9A84C] text-[#1E6B5A] px-10 py-4 text-sm font-bold uppercase tracking-[0.15em] rounded-sm shadow-md hover:bg-[#b8943d] transition-colors duration-300"
                  >
                    <Send size={16} /> Submit Message
                  </motion.button>
                </div>
              </motion.form>
            )}
          </div>
        </section>

        {/* ── Bulk Orders ───────────────────────────────────────────── */}
        <section className="bg-[#1E6B5A] py-16 md:py-24 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-8"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23C9A84C' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
          <div className="relative z-10 container mx-auto px-4">
            <motion.div
              custom={0}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center mb-12"
            >
              <p className="text-[#C9A84C] uppercase tracking-[0.3em] text-xs font-bold mb-3">For Businesses</p>
              <h2 className="font-serif text-3xl md:text-4xl text-[#F3F8F5] font-bold mb-4">
                Bulk Order & Corporate Orders
              </h2>
              <p className="text-[#C8D8D0] text-sm max-w-xl mx-auto">
                Suitable for boutiques, wedding planners, and retailers. Get wholesale pricing on authentic sarees for any occasion or business need.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-12">
              {BULK_TYPES.map((item, i) => (
                <motion.div
                  key={item.title}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  className="bg-white/10 hover:bg-white/15 border border-[#C9A84C]/30 hover:border-[#C9A84C]/60 rounded-2xl p-5 text-center transition-all duration-300 group cursor-pointer"
                >
                  <div className="text-3xl mb-3">{item.icon}</div>
                  <h3 className="font-semibold text-[#F3F8F5] text-sm mb-2 leading-tight">{item.title}</h3>
                  <p className="text-[#C8D8D0]/70 text-xs leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>

            <motion.div
              custom={6}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center"
            >
              <a
                href="#contact-form"
                className="inline-flex items-center gap-2 bg-[#C9A84C] text-[#1E6B5A] px-10 py-4 text-sm font-bold uppercase tracking-[0.2em] rounded-sm shadow-xl hover:bg-[#F3F8F5] transition-colors duration-300"
              >
                <ShoppingBag size={16} /> Request Bulk Quote
              </a>
              <p className="text-[#C8D8D0]/60 text-xs mt-4">
                Our business team will contact you within 48 hours with a custom quote.
              </p>
            </motion.div>
          </div>
        </section>

      </div>
    </Layout>
  );
}
