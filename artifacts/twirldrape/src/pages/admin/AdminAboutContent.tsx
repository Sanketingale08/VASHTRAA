import React, { useEffect, useRef, useState } from "react";
import { Loader2, Save, RotateCcw } from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
import { adminHeaders } from '@/lib/adminApi';
const NAVY = "#0D1B36";
const GOLD = "#C7CCD1";

interface Stat {
  label: string;
  value: string;
}

interface Card {
  title: string;
  desc: string;
}

interface AboutContent {
  stats: Stat[];
  heroHeadline: string;
  heroSubtext: string;
  storyHeadline: string;
  storyParagraph1: string;
  storyParagraph2: string;
  weaversHeadline: string;
  weaversParagraph1: string;
  weaversParagraph2: string;
  ctaHeadline: string;
  ctaSubtext: string;
  missionValues: Card[];
  trustBadges: Card[];
}

const DEFAULT: AboutContent = {
  stats: [
    { label: "Weaver Partners", value: "40+" },
    { label: "Sarees Delivered", value: "2,800+" },
    { label: "Cities Served", value: "180+" },
    { label: "Years of Trust", value: "3+" },
  ],
  heroHeadline: "Handwoven in India.\nDelivered to Your Door.",
  heroSubtext:
    "VASTRAA started with a single question: why is it so hard to find a genuinely handwoven saree without travelling to the source? We set out to fix that — building a marketplace where India's weavers sell directly, and every saree arrives with its full story intact.",
  storyHeadline: "Born in Paithan. Built for Every Indian Wardrobe.",
  storyParagraph1:
    "In 2022, our founder Anjali Deshmukh visited a Paithani weaver co-operative in Paithan, Maharashtra, and found master weavers selling centuries-old work through local middlemen for a fraction of what buyers paid. She came back with twelve sarees and a resolve: give these artisans a direct channel to the people who would truly value their craft.",
  storyParagraph2:
    "VASTRAA launched with those twelve pieces and has grown steadily — never chasing volume, always vetting every seller personally. Today, every listing carries the weaver's name, their region, and the technique behind the cloth. That transparency is the product.",
  weaversHeadline: "Forty Families. Dozens of Traditions.",
  weaversParagraph1:
    "Every seller on VASTRAA is admitted by hand — Anjali or Rohan visits the workshop, speaks with the weavers, and photographs the process before a single listing goes live. Our current partners span Paithani silk from Paithan and Yeola, Kanjivaram from Kanchipuram, Chanderi from Madhya Pradesh, and Tant from West Bengal.",
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
    { title: "Verified Vendors & Quality Assured", desc: "All vendors go through a rigorous quality check before listing on VASTRAA." },
    { title: "Secure Payments & Data Protection", desc: "Bank-grade encryption keeps your payment and personal data completely safe." },
    { title: "Easy Returns & Refunds", desc: "Hassle-free returns within 7 days — no questions asked, full refund guaranteed." },
    { title: "Fast & Reliable Pan India Delivery", desc: "Swift shipping across all states with real-time tracking on every order." },
    { title: "Dedicated Support 24/7", desc: "Our saree experts are always available to help you find the perfect drape." },
  ],
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:border-transparent";
const textareaCls = inputCls + " resize-none";

export default function AdminAboutContent() {
  const [form, setForm] = useState<AboutContent>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/about-content?_t=${Date.now()}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((data: AboutContent) => {
        if (data && typeof data === "object") {
          setForm((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => setForm(DEFAULT))
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function set(field: keyof AboutContent, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setStat(index: number, key: keyof Stat, value: string) {
    setForm((prev) => {
      const stats = prev.stats.map((s, i) =>
        i === index ? { ...s, [key]: value } : s
      );
      return { ...prev, stats };
    });
  }

  function setCard(
    section: "missionValues" | "trustBadges",
    index: number,
    key: keyof Card,
    value: string
  ) {
    setForm((prev) => {
      const cards = prev[section].map((c, i) =>
        i === index ? { ...c, [key]: value } : c
      );
      return { ...prev, [section]: cards };
    });
  }

  async function handleSave() {
    if (inFlight.current.has("handleSave")) return;
    inFlight.current.add("handleSave");
    setSaving(true);
    setToast(null);
    try {
      const r = await fetch(`/api/admin/about-content`, {
        method: "PUT",
        headers: adminHeaders(),
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (r.ok) {
        showToast("About page content saved successfully.", true);
      } else {
        const err = await r.json().catch(() => ({ error: "Failed to save changes" }));
        showToast(err.error || "Failed to save changes.", false);
      }
    } catch {
      showToast("Network error — could not save changes.", false);
    } finally {
      inFlight.current.delete("handleSave");
      setSaving(false);
    }
  }

  function handleReset() {
    setForm(DEFAULT);
    showToast("Restored to defaults (not yet saved).", true);
  }

  if (loading) {
    return (
      <AdminGuard>
        <AdminLayout>
          <div className="flex items-center justify-center py-24">
            <Loader2 className="animate-spin w-6 h-6 text-gray-400" />
          </div>
        </AdminLayout>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <AdminLayout>
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">About Page Content</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <RotateCcw size={14} />
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60"
                style={{ background: NAVY }}
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>

          {toast && (
            <div
              className={`rounded-lg px-4 py-3 text-sm font-medium ${
                toast.ok
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {toast.msg}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-sm font-bold text-gray-700 border-b border-gray-100 pb-3">
              Stats Bar
            </h2>
            <p className="text-xs text-gray-400 -mt-3">
              The four numbers shown across the top of the page.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {form.stats.map((stat, i) => (
                <div
                  key={i}
                  className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50"
                >
                  <Field label={`Stat ${i + 1} — Value`}>
                    <input
                      className={inputCls}
                      style={{ focusRingColor: GOLD } as React.CSSProperties}
                      value={stat.value}
                      onChange={(e) => setStat(i, "value", e.target.value)}
                      placeholder="e.g. 40+"
                    />
                  </Field>
                  <Field label="Label">
                    <input
                      className={inputCls}
                      value={stat.label}
                      onChange={(e) => setStat(i, "label", e.target.value)}
                      placeholder="e.g. Weaver Partners"
                    />
                  </Field>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-sm font-bold text-gray-700 border-b border-gray-100 pb-3">
              Hero Section
            </h2>
            <Field
              label="Headline"
              hint='Use \n to break across lines, e.g. "Line one.\nLine two."'
            >
              <textarea
                className={textareaCls}
                rows={2}
                value={form.heroHeadline}
                onChange={(e) => set("heroHeadline", e.target.value)}
              />
            </Field>
            <Field label="Subtext">
              <textarea
                className={textareaCls}
                rows={4}
                value={form.heroSubtext}
                onChange={(e) => set("heroSubtext", e.target.value)}
              />
            </Field>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-sm font-bold text-gray-700 border-b border-gray-100 pb-3">
              Brand Story Section
            </h2>
            <Field label="Headline">
              <input
                className={inputCls}
                value={form.storyHeadline}
                onChange={(e) => set("storyHeadline", e.target.value)}
              />
            </Field>
            <Field label="First Paragraph">
              <textarea
                className={textareaCls}
                rows={4}
                value={form.storyParagraph1}
                onChange={(e) => set("storyParagraph1", e.target.value)}
              />
            </Field>
            <Field label="Second Paragraph">
              <textarea
                className={textareaCls}
                rows={4}
                value={form.storyParagraph2}
                onChange={(e) => set("storyParagraph2", e.target.value)}
              />
            </Field>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-sm font-bold text-gray-700 border-b border-gray-100 pb-3">
              Our Weavers Section
            </h2>
            <Field label="Headline">
              <input
                className={inputCls}
                value={form.weaversHeadline}
                onChange={(e) => set("weaversHeadline", e.target.value)}
              />
            </Field>
            <Field label="First Paragraph">
              <textarea
                className={textareaCls}
                rows={4}
                value={form.weaversParagraph1}
                onChange={(e) => set("weaversParagraph1", e.target.value)}
              />
            </Field>
            <Field label="Second Paragraph">
              <textarea
                className={textareaCls}
                rows={4}
                value={form.weaversParagraph2}
                onChange={(e) => set("weaversParagraph2", e.target.value)}
              />
            </Field>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-sm font-bold text-gray-700 border-b border-gray-100 pb-3">
              Mission &amp; Values Cards
            </h2>
            <p className="text-xs text-gray-400 -mt-3">
              The four principle cards shown in the Mission &amp; Values section.
            </p>
            <div className="space-y-4">
              {form.missionValues.map((card, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Card {i + 1}</p>
                  <Field label="Title">
                    <input
                      className={inputCls}
                      value={card.title}
                      onChange={(e) => setCard("missionValues", i, "title", e.target.value)}
                      placeholder="e.g. Heritage First"
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      className={textareaCls}
                      rows={2}
                      value={card.desc}
                      onChange={(e) => setCard("missionValues", i, "desc", e.target.value)}
                    />
                  </Field>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-sm font-bold text-gray-700 border-b border-gray-100 pb-3">
              Trust Badges
            </h2>
            <p className="text-xs text-gray-400 -mt-3">
              The six trust indicators shown in the "Why Shop With VASTRAA?" section.
            </p>
            <div className="space-y-4">
              {form.trustBadges.map((badge, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Badge {i + 1}</p>
                  <Field label="Title">
                    <input
                      className={inputCls}
                      value={badge.title}
                      onChange={(e) => setCard("trustBadges", i, "title", e.target.value)}
                      placeholder="e.g. 100% Authentic Products"
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      className={textareaCls}
                      rows={2}
                      value={badge.desc}
                      onChange={(e) => setCard("trustBadges", i, "desc", e.target.value)}
                    />
                  </Field>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-sm font-bold text-gray-700 border-b border-gray-100 pb-3">
              Call-to-Action Section
            </h2>
            <Field label="Headline">
              <input
                className={inputCls}
                value={form.ctaHeadline}
                onChange={(e) => set("ctaHeadline", e.target.value)}
              />
            </Field>
            <Field label="Subtext">
              <textarea
                className={textareaCls}
                rows={2}
                value={form.ctaSubtext}
                onChange={(e) => set("ctaSubtext", e.target.value)}
              />
            </Field>
          </div>

          <div className="flex justify-end pb-8">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60"
              style={{ background: NAVY }}
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}
