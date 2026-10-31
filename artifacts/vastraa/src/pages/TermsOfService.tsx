import React from "react";
import { Layout } from "@/components/Layout";

const LAST_UPDATED = "1 July 2025";

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    content: `By accessing or using VASTRAA ("the Platform"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to all of these Terms, you must not use the Platform. We may update these Terms from time to time; your continued use after any update constitutes acceptance of the revised Terms.`,
  },
  {
    title: "2. Eligibility",
    content: `You must be at least 18 years of age to use VASTRAA. By using the Platform, you represent and warrant that you are 18 years of age or older and have the legal capacity to enter into a binding agreement.`,
  },
  {
    title: "3. Accounts",
    content: `To access certain features (order tracking, wishlist, account history), you must create an account. You are responsible for:

• Keeping your login credentials confidential.
• All activity that occurs under your account.
• Notifying us immediately of any unauthorised use at support@vastraa.com.

We reserve the right to suspend or terminate accounts that violate these Terms or are used for fraudulent activity.`,
  },
  {
    title: "4. Products and Listings",
    content: `VASTRAA is a marketplace that connects buyers with independent artisan vendors. We make reasonable efforts to ensure listing accuracy, but:

• Product colours may appear slightly different depending on your screen settings.
• Minor variations in handwoven items (pattern placement, weight) are inherent to handcraft and are not defects.
• Stock availability is subject to change; if an ordered item becomes unavailable, we will notify you and offer a full refund or alternative.`,
  },
  {
    title: "5. Pricing and Payment",
    content: `All prices on VASTRAA are listed in Indian Rupees (INR) and include applicable GST unless otherwise stated. A Cash on Delivery (COD) handling fee of ₹49 applies where COD is selected. We reserve the right to modify prices at any time; the price at the time of order confirmation is the price you pay. We accept UPI, cards, net banking, digital wallets, and COD. Payments are processed by certified third-party gateways; we do not store full card or bank details.`,
  },
  {
    title: "6. Shipping and Delivery",
    content: `Orders are typically dispatched within 48 hours of confirmation. Delivery timelines (5–8 business days standard, 2–3 business days express) are estimates and not guarantees. VASTRAA is not liable for delays caused by courier partners, natural events, or conditions beyond our control. For full details, see our Shipping Info page.`,
  },
  {
    title: "7. Returns and Refunds",
    content: `Returns are accepted within 7 days of delivery, subject to conditions detailed on our Returns & Exchanges page. Refunds are processed to the original payment method within 3–5 business days of successful quality check. We reserve the right to reject returns that do not meet the stated conditions.`,
  },
  {
    title: "8. Intellectual Property",
    content: `All content on VASTRAA — including text, images, logos, designs, and software — is the property of VASTRAA or its licensors and is protected by applicable intellectual property laws. You may not reproduce, distribute, modify, or create derivative works of any content without our explicit written consent.`,
  },
  {
    title: "9. User Conduct",
    content: `You agree not to:

• Use the Platform for any unlawful purpose.
• Submit false, misleading, or fraudulent information.
• Attempt to gain unauthorised access to any part of the Platform.
• Scrape, harvest, or systematically collect data from the Platform without permission.
• Post content that is defamatory, obscene, or infringes third-party rights.

Violation of these restrictions may result in immediate account suspension and legal action.`,
  },
  {
    title: "10. Vendor Relationships",
    content: `Vendors on VASTRAA are independent third parties. VASTRAA facilitates the marketplace but is not a party to the underlying sale contract between buyer and vendor. VASTRAA does not represent or warrant the accuracy of vendor-provided product descriptions and is not liable for vendor non-performance, except as expressly stated in our buyer protection policies.`,
  },
  {
    title: "11. Limitation of Liability",
    content: `To the fullest extent permitted by law, VASTRAA and its officers, directors, employees, and agents are not liable for:

• Indirect, incidental, consequential, or punitive damages arising from your use of the Platform.
• Loss of data, profits, or business opportunities.
• Damages arising from delays, delivery failures, or acts of third-party logistics providers.

Our total liability for any claim arising out of or related to these Terms shall not exceed the amount paid by you for the relevant order.`,
  },
  {
    title: "12. Governing Law and Disputes",
    content: `These Terms are governed by and construed in accordance with the laws of India. Any dispute arising out of or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts of Mumbai, Maharashtra. We encourage you to contact our support team first to resolve any disputes informally before initiating legal proceedings.`,
  },
  {
    title: "13. Modifications to the Platform",
    content: `We reserve the right to modify, suspend, or discontinue any part of the Platform at any time without notice or liability. We will endeavour to provide advance notice for significant changes.`,
  },
  {
    title: "14. Contact",
    content: `For questions about these Terms, contact us at:

VASTRAA Legal Team
Email: support@vastraa.com
Address: 123 Silk Route, Colaba, Mumbai 400005, India`,
  },
];

function renderContent(text: string) {
  return text.split("\n").map((line, i) => {
    if (line.startsWith("• ")) {
      return (
        <li key={i} className="flex items-start gap-2 text-sm text-[#7a5f4e] leading-relaxed">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C7CCD1] mt-1.5 shrink-0" />
          <span>{line.slice(2)}</span>
        </li>
      );
    }
    if (line.trim() === "") return null;
    return (
      <p key={i} className="text-sm text-[#7a5f4e] leading-relaxed">{line}</p>
    );
  });
}

export default function TermsOfService() {
  return (
    <Layout>
      <div className="bg-[#F4F5F7] min-h-screen">

        {/* Hero */}
        <section className="bg-[#0A1F44] py-16 md:py-20">
          <div className="container mx-auto px-4 text-center">
            <p className="text-[#C7CCD1] uppercase tracking-[0.3em] text-xs font-bold mb-4">Legal</p>
            <h1 className="font-serif text-4xl md:text-5xl text-[#F4F5F7] font-bold mb-3">
              Terms of Service
            </h1>
            <p className="text-[#E5E8EC] text-sm">Last updated: {LAST_UPDATED}</p>
          </div>
        </section>

        {/* Intro */}
        <section className="container mx-auto px-4 py-10 max-w-3xl">
          <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6 shadow-sm">
            <p className="text-sm text-[#7a5f4e] leading-relaxed">
              Please read these Terms of Service carefully before using VASTRAA. These Terms govern your
              access to and use of our website, mobile application, and related services. By creating an
              account or placing an order, you agree to these Terms in full.
            </p>
          </div>
        </section>

        {/* Sections */}
        <section className="container mx-auto px-4 pb-16 max-w-3xl space-y-10">
          {SECTIONS.map((sec) => (
            <div key={sec.title}>
              <h2 className="font-serif text-lg text-[#0A1F44] font-bold mb-4">{sec.title}</h2>
              <ul className="space-y-2">{renderContent(sec.content)}</ul>
            </div>
          ))}
        </section>
      </div>
    </Layout>
  );
}
