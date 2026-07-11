import React, { useState, useMemo } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronUp, MessageCircle, Search, X } from "lucide-react";
import { Layout } from "@/components/Layout";

const GOLD = "#C9A84C";
const GREEN = "#1E6B5A";

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
          "You can cancel or modify your order within 24 hours of placement, before it has been dispatched. Contact our support team immediately via the Support page or email support@twirldrape.com. Once dispatched, cancellations are not possible.",
      },
      {
        question: "Is it safe to shop on TwirlDrape?",
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
        question: "Are the sarees on TwirlDrape authentic?",
        answer:
          "Every saree listed on TwirlDrape is sourced directly from verified artisans and weaver collectives across India. Our team personally visits each vendor before onboarding, and all Paithani sarees come with an authenticity certificate.",
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

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-[#C9A84C]/30 text-[#3D1515] rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function FAQAccordion({ items, query }: { items: FAQItem[]; query: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  React.useEffect(() => {
    if (query.trim()) {
      setOpenIndex(null);
    }
  }, [query]);

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div
          key={i}
          className="bg-white border border-[#C9A84C]/20 rounded-xl overflow-hidden"
        >
          <button
            className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[#F3F8F5] transition-colors"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            aria-expanded={openIndex === i}
          >
            <span className="font-medium text-[#3D1515] text-sm leading-snug">
              {highlight(item.question, query)}
            </span>
            {openIndex === i
              ? <ChevronUp size={18} className="shrink-0 text-[#C9A84C]" />
              : <ChevronDown size={18} className="shrink-0 text-[#7a5f4e]" />}
          </button>
          {openIndex === i && (
            <div className="px-5 pb-5 text-sm text-[#7a5f4e] leading-relaxed border-t border-[#C9A84C]/10 pt-4">
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
      <div className="bg-[#F3F8F5] min-h-screen">

        {/* Hero */}
        <section className="bg-[#1E6B5A] py-16 md:py-24">
          <div className="container mx-auto px-4 text-center">
            <p className="text-[#C9A84C] uppercase tracking-[0.3em] text-xs font-bold mb-4">Help Centre</p>
            <h1 className="font-serif text-4xl md:text-5xl text-[#F3F8F5] font-bold mb-4">
              Frequently Asked Questions
            </h1>
            <p className="text-[#E6F0EA] max-w-xl mx-auto text-base leading-relaxed mb-8">
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
                className="w-full pl-11 pr-10 py-3.5 rounded-xl bg-white text-[#3D1515] text-sm placeholder-[#b09a87] border border-transparent focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/60 shadow-sm"
                aria-label="Search FAQs"
              />
              {isSearching && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7a5f4e] hover:text-[#3D1515] transition-colors"
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
            <div className="text-center py-16">
              <p className="text-[#7a5f4e] text-base mb-2">No FAQs match your search.</p>
              <p className="text-sm text-[#7a5f4e]/70">
                Try different keywords or{" "}
                <button
                  onClick={() => setQuery("")}
                  className="underline hover:text-[#1E6B5A] transition-colors"
                >
                  clear the search
                </button>{" "}
                to see all questions.
              </p>
            </div>
          ) : (
            filteredSections.map((sec) => (
              <div key={sec.section} className="mb-12">
                <h2 className="font-serif text-xl text-[#1E6B5A] font-bold mb-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-[#C9A84C]/30" />
                  {sec.section}
                  <span className="h-px flex-1 bg-[#C9A84C]/30" />
                </h2>
                <FAQAccordion items={sec.items} query={query} />
              </div>
            ))
          )}
        </section>

        {/* CTA */}
        <section className="bg-[#E6F0EA] py-14">
          <div className="container mx-auto px-4 text-center">
            <MessageCircle className="w-10 h-10 mx-auto mb-4" style={{ color: GOLD }} />
            <h2 className="font-serif text-xl md:text-2xl text-[#1E6B5A] font-bold mb-3">
              Still have questions?
            </h2>
            <p className="text-[#7a5f4e] mb-6 text-sm">
              Our team typically responds within a few hours on business days.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-[#1E6B5A] text-white px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-[#5e1421] transition-colors"
            >
              Contact Support
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}
