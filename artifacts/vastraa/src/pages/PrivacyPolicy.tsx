import React from "react";
import { Layout } from "@/components/Layout";

const LAST_UPDATED = "1 July 2025";

const SECTIONS = [
  {
    title: "1. Information We Collect",
    content: `When you use VASTRAA, we may collect the following types of information:

• **Account information** — name, email address, phone number, and password (stored in hashed form) when you create an account.
• **Order information** — delivery address, billing details, and purchase history needed to fulfil and support your orders.
• **Payment information** — payment method details are processed by our certified payment gateway partners and are never stored on our servers in full.
• **Device and usage data** — browser type, IP address, pages visited, and click patterns collected to improve site performance and personalise your experience.
• **Communications** — messages you send to our support team, reviews, or feedback you submit on the platform.`,
  },
  {
    title: "2. How We Use Your Information",
    content: `We use the information we collect to:

• Process and fulfil your orders, including notifying you of dispatch and delivery.
• Provide customer support and respond to queries, returns, and complaints.
• Send order confirmations, shipping updates, and account notifications via email and SMS.
• Send promotional communications (only with your consent; you may opt out at any time).
• Detect and prevent fraud, unauthorised access, and abuse of our platform.
• Improve our website, product listings, and shopping experience based on aggregated usage data.
• Comply with applicable legal obligations.`,
  },
  {
    title: "3. Sharing of Information",
    content: `We do not sell your personal information. We share information only in the following circumstances:

• **Vendor partners** — to fulfil your order, relevant details (name, delivery address, contact number) are shared with the vendor who listed the product.
• **Logistics partners** — address and contact details are shared with our delivery partners to enable shipment and delivery.
• **Payment processors** — payment information is shared with certified payment gateway providers for transaction processing.
• **Legal requirements** — we may disclose information if required by law, court order, or government authority.
• **Business transfers** — in the event of a merger, acquisition, or sale of assets, your data may be transferred as part of that transaction, with notice provided to you.`,
  },
  {
    title: "4. Data Retention",
    content: `We retain your personal information for as long as your account is active or as needed to provide services. Order records are retained for a minimum of 5 years to comply with applicable tax and accounting laws. You may request deletion of your account and associated data by contacting us at support@vastraa.com; please note that we may retain certain information as required by law or for legitimate business purposes.`,
  },
  {
    title: "5. Cookies",
    content: `VASTRAA uses cookies and similar tracking technologies to:

• Keep you signed in across sessions.
• Remember your cart and wishlist items.
• Understand how visitors navigate the site (analytics).
• Serve relevant advertising on third-party platforms (only with consent).

You can manage or disable cookies in your browser settings. Disabling cookies may affect certain features of the site, such as persistent cart and login sessions.`,
  },
  {
    title: "6. Security",
    content: `We implement industry-standard security measures including TLS/SSL encryption for data in transit, access controls, and regular security audits. However, no method of transmission over the Internet is completely secure, and we cannot guarantee absolute security. In the event of a data breach that affects your personal information, we will notify you as required by applicable law.`,
  },
  {
    title: "7. Your Rights",
    content: `Depending on your jurisdiction, you may have the following rights regarding your personal data:

• **Access** — request a copy of the personal information we hold about you.
• **Correction** — ask us to correct inaccurate or incomplete information.
• **Deletion** — request that we delete your personal information (subject to legal retention requirements).
• **Objection** — object to certain uses of your data, including direct marketing.
• **Portability** — receive your data in a structured, commonly used format.

To exercise any of these rights, contact us at support@vastraa.com.`,
  },
  {
    title: "8. Third-Party Links",
    content: `Our website may contain links to third-party websites or services. This Privacy Policy does not apply to those external sites. We encourage you to review the privacy policies of any third-party site you visit.`,
  },
  {
    title: "9. Children's Privacy",
    content: `VASTRAA is not directed at individuals under the age of 18. We do not knowingly collect personal information from minors. If you believe we have inadvertently collected such data, please contact us and we will promptly delete it.`,
  },
  {
    title: "10. Changes to This Policy",
    content: `We may update this Privacy Policy from time to time. When we do, we will revise the 'Last Updated' date at the top of this page and, for material changes, notify you by email or a prominent notice on our website. Your continued use of VASTRAA after such changes constitutes your acceptance of the updated policy.`,
  },
  {
    title: "11. Contact Us",
    content: `If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:

VASTRAA Customer Support
Email: support@vastraa.com
Address: 123 Silk Route, Colaba, Mumbai 400005, India`,
  },
];

function renderContent(text: string) {
  return text.split("\n").map((line, i) => {
    if (line.startsWith("• ")) {
      const content = line.slice(2).replace(/\*\*(.+?)\*\*/g, (_, m) => `<strong>${m}</strong>`);
      return (
        <li key={i} className="flex items-start gap-2 text-sm text-[#7a5f4e] leading-relaxed">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C7CCD1] mt-1.5 shrink-0" />
          <span dangerouslySetInnerHTML={{ __html: content }} />
        </li>
      );
    }
    if (line.trim() === "") return null;
    const html = line.replace(/\*\*(.+?)\*\*/g, (_, m) => `<strong>${m}</strong>`);
    return (
      <p key={i} className="text-sm text-[#7a5f4e] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
    );
  });
}

export default function PrivacyPolicy() {
  return (
    <Layout>
      <div className="bg-[#F4F5F7] min-h-screen">

        {/* Hero */}
        <section className="bg-[#0A1F44] py-16 md:py-20">
          <div className="container mx-auto px-4 text-center">
            <p className="text-[#C7CCD1] uppercase tracking-[0.3em] text-xs font-bold mb-4">Legal</p>
            <h1 className="font-serif text-4xl md:text-5xl text-[#F4F5F7] font-bold mb-3">
              Privacy Policy
            </h1>
            <p className="text-[#E5E8EC] text-sm">Last updated: {LAST_UPDATED}</p>
          </div>
        </section>

        {/* Intro */}
        <section className="container mx-auto px-4 py-10 max-w-3xl">
          <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6 shadow-sm">
            <p className="text-sm text-[#7a5f4e] leading-relaxed">
              VASTRAA ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy
              explains what personal information we collect, how we use it, and what rights you have in relation
              to your data when you use our website and services at{" "}
              <span className="text-[#0A1F44] font-medium">vastraa.com</span>.
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
