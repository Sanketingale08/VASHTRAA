/**
 * E2E: About page content — save via admin API, reload on public page
 *
 * Covers:
 *   PUT /api/admin/about-content  — persists new content (requires x-admin-key)
 *   GET /api/about-content        — returns the stored content
 *   /about                        — public page reflects the persisted values
 *
 * API calls are made via page.evaluate(fetch(...)) so they run inside the
 * browser process and avoid IPv6 / EAFNOSUPPORT issues that affect
 * page.request on this host.
 *
 * Test isolation: the suite fetches the original content before mutating it
 * and unconditionally restores it in afterAll, even if assertions fail.
 */
import { test, expect } from "@playwright/test";

// Unique marker so the test value is unmistakable in the rendered page.
const TEST_STAT_VALUE = `E2E-${Date.now()}+`;
const TEST_STAT_LABEL = "E2E Weaver Partners";

const DEFAULT_FALLBACK = {
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

/** Minimal valid payload with one stat changed to the unique test value. */
function buildTestBody() {
  return {
    ...DEFAULT_FALLBACK,
    stats: [
      { label: TEST_STAT_LABEL, value: TEST_STAT_VALUE },
      ...DEFAULT_FALLBACK.stats.slice(1),
    ],
  };
}

test.describe("About page content — admin save + public reload", () => {
  /**
   * Snapshot of the content that existed before any test ran.
   * Restored unconditionally in afterAll so the suite is side-effect-free.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalContent: any = DEFAULT_FALLBACK;
  let adminKey: string | undefined;

  test.beforeAll(async ({ browser }) => {
    adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) return;

    // Snapshot the live content so we can restore it afterwards.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      const current = await page.evaluate(async () => {
        const r = await fetch("/api/about-content", { credentials: "include" });
        return r.json();
      });
      if (current && typeof current === "object" && current.stats) {
        originalContent = current;
      }
    } finally {
      await ctx.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    if (!adminKey) return;

    // Unconditionally restore the original content, even if tests failed.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(
        async ({ body, key }: { body: typeof DEFAULT_FALLBACK; key: string }) => {
          await fetch("/api/admin/about-content", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-admin-key": key,
            },
            body: JSON.stringify(body),
          });
        },
        { body: originalContent, key: adminKey },
      );
    } finally {
      await ctx.close();
    }
  });

  test("PUT /api/admin/about-content saves; GET /api/about-content returns it", async ({
    page,
  }) => {
    if (!adminKey) {
      test.skip(true, "ADMIN_API_KEY not set — cannot authenticate admin requests");
      return;
    }

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // 1. Reject requests that lack the admin key (403 expected).
    const unauthorizedStatus = await page.evaluate(async (body: typeof DEFAULT_FALLBACK) => {
      const r = await fetch("/api/admin/about-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return r.status;
    }, buildTestBody());
    expect(unauthorizedStatus).toBe(403);

    // 2. Save new content with the correct key.
    const testBody = buildTestBody();
    const putResult = await page.evaluate(
      async ({ body, key }: { body: typeof DEFAULT_FALLBACK; key: string }) => {
        const r = await fetch("/api/admin/about-content", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": key,
          },
          body: JSON.stringify(body),
        });
        return { status: r.status, data: await r.json() };
      },
      { body: testBody, key: adminKey },
    );
    expect(putResult.status).toBe(200);
    expect(putResult.data).toMatchObject({ ok: true });

    // 3. GET /api/about-content should now return the saved content.
    const getResult = await page.evaluate(async () => {
      const r = await fetch("/api/about-content", { credentials: "include" });
      return r.json();
    });
    expect(getResult.stats[0].value).toBe(TEST_STAT_VALUE);
    expect(getResult.stats[0].label).toBe(TEST_STAT_LABEL);
  });

  test("Public /about page renders the stat value saved by the admin", async ({
    page,
  }) => {
    if (!adminKey) {
      test.skip(true, "ADMIN_API_KEY not set — cannot authenticate admin requests");
      return;
    }

    // Load the app so the browser origin is set for relative fetch calls.
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Save content via the admin API from within the browser.
    const testBody = buildTestBody();
    const putResult = await page.evaluate(
      async ({ body, key }: { body: typeof DEFAULT_FALLBACK; key: string }) => {
        const r = await fetch("/api/admin/about-content", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": key,
          },
          body: JSON.stringify(body),
        });
        return { status: r.status, data: await r.json() };
      },
      { body: testBody, key: adminKey },
    );
    expect(putResult.status).toBe(200);
    expect(putResult.data).toMatchObject({ ok: true });

    // Navigate to the public About page and assert the saved stat is visible.
    await page.goto("/about");
    await page.waitForLoadState("domcontentloaded");

    // The stats bar renders {s.value} then {s.label} for each stat.
    const statValue = page.getByText(TEST_STAT_VALUE);
    await expect(statValue).toBeVisible({ timeout: 15_000 });

    const statLabel = page.getByText(TEST_STAT_LABEL);
    await expect(statLabel).toBeVisible({ timeout: 5_000 });
  });
});
