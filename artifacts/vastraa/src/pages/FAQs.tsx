import React, { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronUp, MessageCircle, Search, X } from "lucide-react";
import { Layout } from "@/components/Layout";

const GOLD = "#C7CCD1";
const GREEN = "#0A1F44";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_SECTIONS: { section: string; items: FAQItem[] }[] = [
  {
    section: "Orders & Shopping",
    items: [
      {
        question: "How do I place an order?",
        answer:
          "Browse our collections, select the saree you love, choose your blouse-piece preference, and click 'Add to Cart'. Once you're ready, head to checkout where you can enter your delivery address and complete payment.",
      },
      {
        question: "Can I modify or cancel my order after placing it?",
        answer:
          "You can cancel or modify your order within 24 hours of placement, before it has been dispatched. Contact our support team immediately via the Support page or email support@vastraa.com. Once dispatched, cancellations are not possible.",
      },
      {
        question: "Is it safe to shop on VASTRAA?",
        answer:
          "Absolutely. We use bank-grade encryption for all transactions. Your payment details are never stored on our servers — all payments are processed through certified payment gateways.",
      },
      {
        question: "Do you offer Cash on Delivery (COD)?",
        answer:
          "Yes, Cash on Delivery is available at select pin codes across India. A small COD handling fee of ₹49 applies and will be shown clearly at checkout before you confirm.",
      },
    ],
  },
  {
    section: "Shipping & Delivery",
    items: [
      {
        question: "How long does delivery take?",
        answer:
          "Standard delivery takes 5–8 business days. Express delivery (2–3 business days) is available in most major cities and can be selected at checkout. Delivery times may vary slightly for remote pin codes.",
      },
      {
        question: "Do you ship across India?",
        answer:
          "We currently deliver to 3,000+ pin codes across India. Enter your pin code on the product page or at checkout to check availability for your area. We're continually expanding our coverage.",
      },
      {
        question: "How can I track my order?",
        answer:
          "Once your order is dispatched, you'll receive a tracking link via email and SMS. You can also check your order status any time from My Account → Orders.",
      },
      {
        question: "Is there a shipping charge?",
        answer:
          "Shipping is free on all prepaid orders above ₹999. For orders below ₹999 or COD orders, a shipping fee of ₹79 applies. See our Shipping Info page for full details.",
      },
    ],
  },
  {
    section: "Returns & Exchanges",
    items: [
      {
        question: "What is your return policy?",
        answer:
          "We accept returns within 7 days of delivery for items that are unused, unwashed, and in original packaging with tags intact. Sarees that have been worn, washed, or altered cannot be returned.",
      },
      {
        question: "How do I initiate a return?",
        answer:
          "Go to My Account → Orders, select the relevant order, and click 'Request Return'. Fill in the reason and submit. Our team will review your request within 24 hours and arrange a pickup.",
      },
      {
        question: "When will I receive my refund?",
        answer:
          "Once the returned item passes our quality check, the refund is processed within 3–5 business days to your original payment method. For COD orders, refunds are issued as store credit or bank transfer.",
      },
      {
        question: "Can I exchange for a different saree?",
        answer:
          "Yes, exchanges are subject to stock availability. Raise a return request and mention your preferred replacement. If the exchange item is higher in value, you'll be asked to pay the difference.",
      },
    ],
  },
  {
    section: "Product & Authenticity",
    items: [
      {
        question: "Are the sarees on VASTRAA authentic?",
        answer:
          "Every saree listed on VASTRAA is sourced directly from verified artisans and weaver collectives across India. Our team personally visits each vendor before onboarding, and all Paithani sarees come with an authenticity certificate.",
      },
      {
        question: "What does 'handwoven' mean?",
        answer:
          "Handwoven means the saree is produced on a traditional loom by a skilled weaver — no power looms or machines are involved. This process gives each piece unique texture, slight variations in pattern, and the warmth of human craft.",
      },
      {
        question: "How do I care for my saree?",
        answer:
          "For silk sarees (Paithani, Kanjivaram), dry cleaning is recommended. Cotton and linen sarees can be hand-washed in cold water with mild detergent. Always store sarees wrapped in a soft muslin cloth away from direct sunlight.",
      },
    ],
  },
  {
    section: "Account & Payments",
    items: [
      {
        question: "Do I need an account to shop?",
        answer:
          "You can browse without an account, but creating one lets you track orders, save your wishlist, store addresses, and enjoy a faster checkout experience.",
      },
      {
        question: "What payment methods do you accept?",
        answer:
          "We accept UPI, credit/debit cards (Visa, Mastercard, RuPay), net banking, digital wallets (Paytm, PhonePe, Google Pay), and Cash on Delivery.",
      },
      {
        question: "How do I apply a coupon code?",
        answer:
          "Enter your coupon code in the 'Apply Coupon' field at the checkout review step. The discount will be applied automatically if the code is valid and your order meets the minimum order value.",
      },
    ],
  },
];

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-[#C7CCD1]/30 text-[#0A1F44] rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function FAQAccordion({ items, query, expandFirst }: { items: FAQItem[]; query: string; expandFirst?: boolean }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  React.useEffect(() => {
    if (query.trim()) {
      setOpenIndex(null);
    }
  }, [query]);

  React.useEffect(() => {
    if (expandFirst) {
      setOpenIndex(0);
    }
  }, [expandFirst]);

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div
          key={i}
          className="bg-white border border-[#C7CCD1]/20 rounded-xl overflow-hidden"
        >
          <button
            className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[#F4F5F7] transition-colors"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            aria-expanded={openIndex === i}
          >
            <span className="font-medium text-[#0A1F44] text-sm leading-snug">
              {highlight(item.question, query)}
            </span>
            {openIndex === i
              ? <ChevronUp size={18} className="shrink-0 text-[#C7CCD1]" />
              : <ChevronDown size={18} className="shrink-0 text-[#7a5f4e]" />}
          </button>
          {openIndex === i && (
            <div className="px-5 pb-5 text-sm text-[#7a5f4e] leading-relaxed border-t border-[#C7CCD1]/10 pt-4">
              {highlight(item.answer, query)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function FAQs() {
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Handle hash-based navigation: scroll to section and expand its first item
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      setActiveSection(hash);
      // Wait a tick for layout to settle, then scroll
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 120);
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_SECTIONS;
    return FAQ_SECTIONS.map((sec) => ({
      ...sec,
      items: sec.items.filter(
        (item) =>
          item.question.toLowerCase().includes(q) ||
          item.answer.toLowerCase().includes(q)
      ),
    })).filter((sec) => sec.items.length > 0);
  }, [query]);

  const totalMatches = filteredSections.reduce((sum, sec) => sum + sec.items.length, 0);
  const isSearching = query.trim().length > 0;

  return (
    <Layout>
      <div className="bg-[#F4F5F7] min-h-screen">

        {/* Hero */}
        <section className="bg-[#0A1F44] py-16 md:py-24">
          <div className="container mx-auto px-4 text-center">
            <p className="text-[#C7CCD1] uppercase tracking-[0.3em] text-xs font-bold mb-4">Help Centre</p>
            <h1 className="font-serif text-4xl md:text-5xl text-[#F4F5F7] font-bold mb-4">
              Frequently Asked Questions
            </h1>
            <p className="text-[#E5E8EC] max-w-xl mx-auto text-base leading-relaxed mb-8">
              Answers to the questions we hear most often. Can't find what you need? Our support team is happy to help.
            </p>

            {/* Search input */}
            <div className="max-w-lg mx-auto relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7a5f4e] pointer-events-none"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search questions and answers…"
                className="w-full pl-11 pr-10 py-3.5 rounded-xl bg-white text-[#0A1F44] text-sm placeholder-[#b09a87] border border-transparent focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/60 shadow-sm"
                aria-label="Search FAQs"
              />
              {isSearching && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a5f4e] hover:text-[#0A1F44] transition-colors"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        </section>

        {/* FAQ Content */}
        <section className="container mx-auto px-4 py-14 md:py-20 max-w-3xl">
          {isSearching && (
            <p className="text-sm text-[#7a5f4e] mb-8 text-center">
              {totalMatches === 0
                ? "No results found for your search."
                : `${totalMatches} result${totalMatches !== 1 ? "s" : ""} found`}
            </p>
          )}

          {filteredSections.length === 0 ? (
            <div className="text-center py-12">
              {/* No-results icon */}
              <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-[#C7CCD1]/10 flex items-center justify-center">
                <Search size={28} className="text-[#C7CCD1]" />
              </div>

              <h3 className="font-serif text-xl text-[#0A1F44] font-bold mb-2">
                No results for "{query}"
              </h3>
              <p className="text-sm text-[#7a5f4e] mb-1">
                Try different keywords or{" "}
                <button
                  onClick={() => setQuery("")}
                  className="underline hover:text-[#0A1F44] transition-colors font-medium"
                >
                  browse all questions
                </button>.
              </p>
              <p className="text-sm text-[#7a5f4e]/70 mb-8">
                If you can't find your answer, our support team is here to help.
              </p>

              <Link
                href="/contact"
                className="inline-flex items-center gap-2 bg-[#0A1F44] text-white px-7 py-3.5 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-[#2C3E6B] transition-colors"
              >
                <MessageCircle size={16} />
                Contact Support
              </Link>

              {/* Popular FAQs */}
              <div className="mt-12 text-left">
                <p className="text-xs text-[#7a5f4e]/60 uppercase tracking-widest font-bold text-center mb-5">
                  Popular questions
                </p>
                <div className="space-y-3">
                  {[
                    FAQ_SECTIONS[0].items[0],
                    FAQ_SECTIONS[1].items[0],
                    FAQ_SECTIONS[2].items[0],
                  ].map((item, i) => (
                    <button
                      key={i}
                      onClick={() => setQuery(item.question.split(" ").slice(0, 3).join(" "))}
                      className="w-full text-left bg-white border border-[#C7CCD1]/20 rounded-xl px-5 py-4 hover:bg-[#F4F5F7] transition-colors group"
                    >
                      <p className="font-medium text-[#0A1F44] text-sm group-hover:text-[#0A1F44] transition-colors">
                        {item.question}
                      </p>
                      <p className="text-xs text-[#7a5f4e]/70 mt-1 line-clamp-2">
                        {item.answer}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            filteredSections.map((sec) => {
              const slug = slugify(sec.section);
              const isActive = activeSection === slug;
              return (
                <div
                  key={sec.section}
                  id={slug}
                  ref={(el) => { sectionRefs.current[slug] = el; }}
                  className="mb-12 scroll-mt-6"
                >
                  <h2 className="font-serif text-xl text-[#0A1F44] font-bold mb-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-[#C7CCD1]/30" />
                    {sec.section}
                    <span className="h-px flex-1 bg-[#C7CCD1]/30" />
                  </h2>
                  <FAQAccordion items={sec.items} query={query} expandFirst={isActive} />
                </div>
              );
            })
          )}
        </section>

        {/* CTA */}
        <section className="bg-[#E5E8EC] py-14">
          <div className="container mx-auto px-4 text-center">
            <MessageCircle className="w-10 h-10 mx-auto mb-4" style={{ color: GOLD }} />
            <h2 className="font-serif text-xl md:text-2xl text-[#0A1F44] font-bold mb-3">
              Still have questions?
            </h2>
            <p className="text-[#7a5f4e] mb-6 text-sm">
              Our team typically responds within a few hours on business days.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-[#0A1F44] text-white px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-[#2C3E6B] transition-colors"
            >
              Contact Support
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}
