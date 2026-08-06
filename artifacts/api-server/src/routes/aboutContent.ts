import { Router } from "express";
import { db } from "@workspace/db";
import { siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ABOUT_SETTINGS_KEY = "about_page_content";

const requireAdminKey = (req: any, res: any, next: any) => {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers["x-admin-key"];
  if (!adminKey || !provided || provided !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

const router = Router();

const DEFAULT_CONTENT = {
  stats: [
    { label: "Weaver Partners", value: "40+" },
    { label: "Sarees Delivered", value: "2,800+" },
    { label: "Cities Served", value: "180+" },
    { label: "Years of Trust", value: "3+" },
  ],
  heroHeadline: "Handwoven in India.\nDelivered to Your Door.",
  heroSubtext:
    "TwirlDrape started with a single question: why is it so hard to find a genuinely handwoven saree without travelling to the source? We set out to fix that — building a marketplace where India's weavers sell directly, and every saree arrives with its full story intact.",
  storyHeadline: "Born in Paithan. Built for Every Indian Wardrobe.",
  storyParagraph1:
    "In 2022, our founder Anjali Deshmukh visited a Paithani weaver co-operative in Paithan, Maharashtra, and found master weavers selling centuries-old work through local middlemen for a fraction of what buyers paid. She came back with twelve sarees and a resolve: give these artisans a direct channel to the people who would truly value their craft.",
  storyParagraph2:
    "TwirlDrape launched with those twelve pieces and has grown steadily — never chasing volume, always vetting every seller personally. Today, every listing carries the weaver's name, their region, and the technique behind the cloth. That transparency is the product.",
  weaversHeadline: "Forty Families. Dozens of Traditions.",
  weaversParagraph1:
    "Every seller on TwirlDrape is admitted by hand — Anjali or Rohan visits the workshop, speaks with the weavers, and photographs the process before a single listing goes live. Our current partners span Paithani silk from Paithan and Yeola, Kanjivaram from Kanchipuram, Chanderi from Madhya Pradesh, and Tant from West Bengal.",
  weaversParagraph2:
    "We pay within 48 hours of delivery confirmation — no net-30 terms, no opaque fee structures. If a weaver raises a concern, it goes directly to Rohan's phone. That accountability is what lets us promise you a saree made with genuine care.",
  ctaHeadline: "Discover the Craft. Wear the Story.",
  ctaSubtext: "Explore our curated collections of handwoven sarees from India's finest artisans.",
  missionValues: [
    { title: "Heritage First", desc: "We champion India's handloom traditions, giving every weave the recognition and respect it deserves." },
    { title: "Direct From Artisans", desc: "We work directly with weaver collectives — no middlemen — so artisans earn fairly for their craft." },
    { title: "Uncompromising Quality", desc: "Every saree is hand-inspected before it reaches you, so authenticity is never in question." },
    { title: "Sustainable Craft", desc: "We champion slow fashion — handwoven pieces made to last generations, not seasons." },
  ],
  trustBadges: [
    { title: "100% Authentic Products", desc: "Every saree is verified and sourced directly from trusted weavers and artisans." },
    { title: "Verified Vendors & Quality Assured", desc: "All vendors go through a rigorous quality check before listing on TwirlDrape." },
    { title: "Secure Payments & Data Protection", desc: "Bank-grade encryption keeps your payment and personal data completely safe." },
    { title: "Easy Returns & Refunds", desc: "Hassle-free returns within 7 days — no questions asked, full refund guaranteed." },
    { title: "Fast & Reliable Pan India Delivery", desc: "Swift shipping across all states with real-time tracking on every order." },
    { title: "Dedicated Support 24/7", desc: "Our saree experts are always available to help you find the perfect drape." },
  ],
};

router.get("/about-content", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, ABOUT_SETTINGS_KEY));
    if (rows.length === 0) {
      return res.json(DEFAULT_CONTENT);
    }
    return res.json(JSON.parse(rows[0].value));
  } catch (err) {
    console.error("GET /about-content error:", err);
    return res.json(DEFAULT_CONTENT);
  }
});

router.put("/admin/about-content", requireAdminKey, async (req, res) => {
  try {
    const content = req.body;
    if (!content || typeof content !== "object") {
      return res.status(400).json({ error: "Invalid body" });
    }
    await db
      .insert(siteSettingsTable)
      .values({ key: ABOUT_SETTINGS_KEY, value: JSON.stringify(content) })
      .onConflictDoUpdate({
        target: siteSettingsTable.key,
        set: { value: JSON.stringify(content), updatedAt: new Date() },
      });
    return res.json({ ok: true });
  } catch (err) {
    console.error("PUT /admin/about-content error:", err);
    return res.status(500).json({ error: "Failed to save" });
  }
});

export default router;
