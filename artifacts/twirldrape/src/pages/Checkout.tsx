import React, { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useUser } from "@clerk/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, ChevronRight, Truck, Zap, CreditCard, Smartphone,
  HandCoins, Tag, X,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { useCart } from "@/context/CartContext";
import type { CartItem } from "@/context/CartContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const BUY_NOW_KEY = "twirl_buy_now";

const COUPONS: Record<string, { type: "percent" | "flat"; value: number; label: string }> = {
  SAVE10: { type: "percent", value: 10, label: "10% off" },
  WELCOME50: { type: "flat", value: 50, label: "₹50 off" },
};

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh",
  "Chandigarh", "Puducherry",
];

type Address = {
  name: string; phone: string; line1: string; line2: string;
  city: string; state: string; pincode: string;
};

type SavedAddress = Address & { id: string; isDefault: boolean };

type DeliveryMethod = "standard" | "express";
type PaymentMethod = "upi" | "card" | "cod";

function getDeliveryDate(method: DeliveryMethod) {
  const date = new Date();
  const days = method === "express" ? 3 : 7;
  let count = 0;
  while (count < days) {
    date.setDate(date.getDate() + 1);
    const d = date.getDay();
    if (d !== 0 && d !== 6) count++;
  }
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#FAF6EE] mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#7B1C2C]/30 focus:border-[#7B1C2C] transition-colors"
      />
    </div>
  );
}

export function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const { items: cartItems, clearCart } = useCart();

  const [step, setStep] = useState(1);
  const [buyNowItems, setBuyNowItems] = useState<CartItem[] | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const orderPlacedRef = React.useRef(false);

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [saveThisAddress, setSaveThisAddress] = useState(false);
  const [enteringNew, setEnteringNew] = useState(false);

  const [address, setAddress] = useState<Address>({
    name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "",
  });
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("standard");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [upiId, setUpiId] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardName, setCardName] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<null | {
    code: string; type: "percent" | "flat"; value: number; label: string;
  }>(null);
  const [couponError, setCouponError] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(BUY_NOW_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.product) {
          setBuyNowItems([{ ...data.product, quantity: data.quantity ?? 1 }]);
        }
      }
    } catch {}
    return () => {
      if (!orderPlacedRef.current) {
        sessionStorage.removeItem(BUY_NOW_KEY);
      }
    };
  }, []);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation("/sign-in");
    }
  }, [isLoaded, isSignedIn, setLocation]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch(`${BASE}/api/addresses`, { credentials: "include" })
      .then(r => r.ok ? r.json() : { addresses: [] })
      .then(data => {
        const addrs: SavedAddress[] = data.addresses ?? [];
        setSavedAddresses(addrs);
        const def = addrs.find(a => a.isDefault) ?? addrs[0];
        if (def) {
          setSelectedSavedId(def.id);
          setAddress({
            name: def.name, phone: def.phone, line1: def.line1,
            line2: def.line2 ?? "", city: def.city, state: def.state, pincode: def.pincode,
          });
        } else {
          setEnteringNew(true);
        }
      })
      .catch(() => setEnteringNew(true));
  }, [isLoaded, isSignedIn]);

  const orderItems = buyNowItems ?? cartItems;

  const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
  let discount = 0;
  if (appliedCoupon) {
    discount = appliedCoupon.type === "percent"
      ? Math.round(subtotal * appliedCoupon.value / 100)
      : Math.min(appliedCoupon.value, subtotal);
  }
  const afterDiscount = subtotal - discount;
  const shippingCost = deliveryMethod === "express" ? 499 : (afterDiscount >= 5000 ? 0 : 199);
  const gst = Math.round(afterDiscount * 0.05);
  const total = afterDiscount + shippingCost + gst;

  function validateAddress() {
    return (
      address.name.trim().length >= 2 &&
      address.phone.trim().length >= 10 &&
      address.line1.trim().length >= 3 &&
      address.city.trim().length >= 2 &&
      address.state !== "" &&
      /^\d{6}$/.test(address.pincode)
    );
  }

  function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    const c = COUPONS[code];
    if (!c) { setCouponError("Invalid coupon code"); return; }
    setAppliedCoupon({ code, ...c });
    setCouponError("");
    setCouponCode("");
  }

  async function placeOrder() {
    setPlacing(true);
    setPlaceError("");
    try {
      const res = await fetch(`${BASE}/api/orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: orderItems.map(i => ({
            productId: i.productId,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            images: i.images,
            vendorName: i.vendorName,
          })),
          address,
          deliveryMethod,
          paymentMethod,
          couponCode: appliedCoupon?.code ?? null,
          subtotal,
          discount,
          shipping: shippingCost,
          tax: gst,
          total,
          isBuyNow: !!buyNowItems,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to place order");
      }
      const data = await res.json();
      orderPlacedRef.current = true;
      sessionStorage.removeItem(BUY_NOW_KEY);
      if (!buyNowItems) await clearCart();
      setLocation(`/orders/${data.orderId}`);
    } catch (err: any) {
      setPlaceError(err.message || "Failed to place order. Please try again.");
    } finally {
      setPlacing(false);
    }
  }

  if (!isLoaded || !isSignedIn) return null;

  if (orderItems.length === 0) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-4">
          <h2 className="font-serif text-2xl text-[#7B1C2C]">Nothing to Checkout</h2>
          <p className="text-gray-500 text-sm">Your cart is empty.</p>
          <Link
            href="/"
            className="bg-[#7B1C2C] text-[#FAF6EE] px-8 py-3 font-bold uppercase tracking-wider text-sm rounded-sm"
          >
            Continue Shopping
          </Link>
        </div>
      </Layout>
    );
  }

  const steps = ["Address", "Delivery", "Payment", "Review"];

  return (
    <Layout>
      <div className="min-h-screen bg-[#FAF6EE] dark:bg-[#1E2329]">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="flex items-center gap-3 mb-8">
            <h1 className="font-serif text-3xl font-bold text-[#7B1C2C]">Checkout</h1>
            {buyNowItems && (
              <span className="text-xs bg-[#C9A84C] text-[#7B1C2C] font-bold px-2 py-1 rounded uppercase tracking-wider">Buy Now</span>
            )}
          </div>

          {/* Step indicator */}
          <div className="flex items-center mb-8 overflow-x-auto pb-2">
            {steps.map((s, i) => {
              const num = i + 1;
              const isDone = step > num;
              const isCurrent = step === num;
              return (
                <React.Fragment key={s}>
                  <button
                    onClick={() => isDone ? setStep(num) : undefined}
                    className="flex items-center gap-2 shrink-0"
                    disabled={!isDone}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                      isDone ? "bg-green-500 text-white cursor-pointer" :
                      isCurrent ? "bg-[#7B1C2C] text-white" : "bg-gray-200 text-gray-400"
                    }`}>
                      {isDone ? <Check size={14} /> : num}
                    </div>
                    <span className={`text-sm font-semibold hidden sm:block ${
                      isCurrent ? "text-[#7B1C2C]" : isDone ? "text-green-600" : "text-gray-400"
                    }`}>{s}</span>
                  </button>
                  {i < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 min-w-[16px] transition-colors ${step > num ? "bg-green-400" : "bg-gray-200"}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <AnimatePresence mode="wait">
                {/* Step 1: Address */}
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.25 }}
                    className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-6"
                  >
                    <h2 className="font-serif text-xl font-bold text-[#7B1C2C] mb-5">Shipping Address</h2>

                    {/* Saved addresses */}
                    {savedAddresses.length > 0 && !enteringNew && (
                      <div className="mb-5 space-y-3">
                        <p className="text-xs uppercase tracking-wider font-semibold text-gray-400 mb-2">Saved Addresses</p>
                        {savedAddresses.map(sa => (
                          <button
                            key={sa.id}
                            onClick={() => {
                              setSelectedSavedId(sa.id);
                              setAddress({
                                name: sa.name, phone: sa.phone, line1: sa.line1,
                                line2: sa.line2 ?? "", city: sa.city, state: sa.state, pincode: sa.pincode,
                              });
                            }}
                            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                              selectedSavedId === sa.id
                                ? "border-[#7B1C2C] bg-[#7B1C2C]/5"
                                : "border-[#C9A84C]/20 hover:border-[#C9A84C]/50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <p className="font-semibold text-sm">{sa.name}</p>
                                  {sa.isDefault && (
                                    <span className="text-[10px] bg-[#C9A84C]/20 text-[#7B1C2C] font-bold px-1.5 py-0.5 rounded">Default</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">{sa.phone}</p>
                                <p className="text-xs text-gray-500 truncate mt-0.5">
                                  {[sa.line1, sa.line2, sa.city, sa.state, sa.pincode].filter(Boolean).join(", ")}
                                </p>
                              </div>
                              {selectedSavedId === sa.id && <Check size={16} className="text-[#7B1C2C] shrink-0 mt-1" />}
                            </div>
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setSelectedSavedId(null);
                            setEnteringNew(true);
                            setAddress({ name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" });
                          }}
                          className="w-full py-2.5 border border-dashed border-[#C9A84C]/40 rounded-xl text-sm font-semibold text-[#7B1C2C] hover:border-[#C9A84C] hover:bg-[#C9A84C]/5 transition-all"
                        >
                          + Add a new address
                        </button>
                      </div>
                    )}

                    {/* New address form */}
                    {(enteringNew || savedAddresses.length === 0) && (
                      <>
                        {savedAddresses.length > 0 && (
                          <div className="flex items-center justify-between mb-4">
                            <p className="text-sm font-semibold text-[#7B1C2C]">New Address</p>
                            <button
                              onClick={() => {
                                setEnteringNew(false);
                                const def = savedAddresses.find(a => a.isDefault) ?? savedAddresses[0];
                                if (def) {
                                  setSelectedSavedId(def.id);
                                  setAddress({
                                    name: def.name, phone: def.phone, line1: def.line1,
                                    line2: def.line2 ?? "", city: def.city, state: def.state, pincode: def.pincode,
                                  });
                                }
                              }}
                              className="text-xs text-[#7B1C2C] font-semibold hover:underline"
                            >
                              ← Back to saved
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Full Name *" value={address.name} onChange={v => setAddress(a => ({ ...a, name: v }))} placeholder="Priya Sharma" />
                          <Field label="Phone Number *" value={address.phone} onChange={v => setAddress(a => ({ ...a, phone: v.replace(/\D/g, "").slice(0, 10) }))} placeholder="9876543210" type="tel" />
                          <div className="sm:col-span-2">
                            <Field label="Address Line 1 *" value={address.line1} onChange={v => setAddress(a => ({ ...a, line1: v }))} placeholder="House / Flat / Block No., Street" />
                          </div>
                          <div className="sm:col-span-2">
                            <Field label="Address Line 2" value={address.line2} onChange={v => setAddress(a => ({ ...a, line2: v }))} placeholder="Area, Landmark (optional)" />
                          </div>
                          <Field label="City *" value={address.city} onChange={v => setAddress(a => ({ ...a, city: v }))} placeholder="Mumbai" />
                          <div>
                            <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#FAF6EE] mb-1.5">State *</label>
                            <select
                              value={address.state}
                              onChange={e => setAddress(a => ({ ...a, state: e.target.value }))}
                              className="w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#7B1C2C]/30 focus:border-[#7B1C2C] transition-colors"
                            >
                              <option value="">Select State</option>
                              {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <Field
                            label="Pincode *"
                            value={address.pincode}
                            onChange={v => setAddress(a => ({ ...a, pincode: v.replace(/\D/g, "").slice(0, 6) }))}
                            placeholder="400001"
                          />
                        </div>
                        <label className="flex items-center gap-2.5 mt-4 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={saveThisAddress}
                            onChange={e => setSaveThisAddress(e.target.checked)}
                            className="w-4 h-4 accent-[#7B1C2C] cursor-pointer"
                          />
                          <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-[#7B1C2C] transition-colors">
                            Save this address for future orders
                          </span>
                        </label>
                      </>
                    )}

                    <button
                      onClick={async () => {
                        if (!validateAddress()) return;
                        if (saveThisAddress && enteringNew && !selectedSavedId) {
                          try {
                            const r = await fetch(`${BASE}/api/addresses`, {
                              method: "POST",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ ...address }),
                            });
                            if (r.ok) {
                              const data = await r.json();
                              setSavedAddresses(prev => [data.address, ...prev]);
                              setSelectedSavedId(data.address.id);
                            }
                          } catch {}
                        }
                        setStep(2);
                      }}
                      disabled={!validateAddress()}
                      className="mt-6 w-full bg-[#7B1C2C] hover:bg-[#6a1826] disabled:opacity-50 disabled:cursor-not-allowed text-[#FAF6EE] py-3.5 font-bold uppercase tracking-wider text-sm rounded-sm flex items-center justify-center gap-2 transition-colors"
                    >
                      Continue to Delivery <ChevronRight size={16} />
                    </button>
                  </motion.div>
                )}

                {/* Step 2: Delivery */}
                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.25 }}
                    className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-6"
                  >
                    <h2 className="font-serif text-xl font-bold text-[#7B1C2C] mb-5">Delivery Method</h2>
                    <div className="space-y-3">
                      {([
                        {
                          id: "standard" as const,
                          Icon: Truck,
                          title: "Standard Delivery",
                          sub: `7 business days · Est. ${getDeliveryDate("standard")}`,
                          price: afterDiscount >= 5000 ? "Free" : "₹199",
                        },
                        {
                          id: "express" as const,
                          Icon: Zap,
                          title: "Express Delivery",
                          sub: `3 business days · Est. ${getDeliveryDate("express")}`,
                          price: "₹499",
                        },
                      ]).map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => setDeliveryMethod(opt.id)}
                          className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                            deliveryMethod === opt.id
                              ? "border-[#7B1C2C] bg-[#7B1C2C]/5"
                              : "border-[#C9A84C]/20 hover:border-[#C9A84C]/50"
                          }`}
                        >
                          <div className={`p-2.5 rounded-full shrink-0 ${deliveryMethod === opt.id ? "bg-[#7B1C2C] text-white" : "bg-gray-100 text-gray-500"}`}>
                            <opt.Icon size={18} />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-sm">{opt.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{opt.sub}</p>
                          </div>
                          <span className={`font-bold text-sm shrink-0 ${opt.price === "Free" ? "text-green-600" : ""}`}>{opt.price}</span>
                          {deliveryMethod === opt.id && <Check size={18} className="text-[#7B1C2C] shrink-0" />}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-3 mt-6">
                      <button onClick={() => setStep(1)} className="flex-1 py-3 border border-[#C9A84C]/40 text-[#7B1C2C] font-bold uppercase tracking-wider text-sm rounded-sm hover:border-[#C9A84C] transition-colors">
                        Back
                      </button>
                      <button onClick={() => setStep(3)} className="flex-1 bg-[#7B1C2C] hover:bg-[#6a1826] text-[#FAF6EE] py-3 font-bold uppercase tracking-wider text-sm rounded-sm flex items-center justify-center gap-2 transition-colors">
                        Continue to Payment <ChevronRight size={16} />
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Step 3: Payment */}
                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.25 }}
                    className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-6"
                  >
                    <h2 className="font-serif text-xl font-bold text-[#7B1C2C] mb-5">Payment Method</h2>
                    <div className="space-y-3">
                      {([
                        { id: "upi" as const, Icon: Smartphone, title: "UPI", sub: "Google Pay, PhonePe, Paytm, BHIM" },
                        { id: "card" as const, Icon: CreditCard, title: "Credit / Debit Card", sub: "Visa, Mastercard, RuPay, Amex" },
                        { id: "cod" as const, Icon: HandCoins, title: "Cash on Delivery", sub: "Pay ₹50 extra when delivered" },
                      ]).map(opt => (
                        <div key={opt.id}>
                          <button
                            onClick={() => setPaymentMethod(opt.id)}
                            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                              paymentMethod === opt.id
                                ? "border-[#7B1C2C] bg-[#7B1C2C]/5"
                                : "border-[#C9A84C]/20 hover:border-[#C9A84C]/50"
                            }`}
                          >
                            <div className={`p-2.5 rounded-full shrink-0 ${paymentMethod === opt.id ? "bg-[#7B1C2C] text-white" : "bg-gray-100 text-gray-500"}`}>
                              <opt.Icon size={18} />
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-sm">{opt.title}</p>
                              <p className="text-xs text-gray-500">{opt.sub}</p>
                            </div>
                            {paymentMethod === opt.id && <Check size={18} className="text-[#7B1C2C] shrink-0" />}
                          </button>

                          {paymentMethod === "upi" && opt.id === "upi" && (
                            <div className="mt-2 pl-2">
                              <Field label="UPI ID" value={upiId} onChange={setUpiId} placeholder="name@okaxis" />
                            </div>
                          )}
                          {paymentMethod === "card" && opt.id === "card" && (
                            <div className="mt-3 pl-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="sm:col-span-2">
                                <Field
                                  label="Card Number"
                                  value={cardNumber}
                                  onChange={v => setCardNumber(v.replace(/\D/g, "").slice(0, 16))}
                                  placeholder="1234 5678 9012 3456"
                                />
                              </div>
                              <Field label="Name on Card" value={cardName} onChange={setCardName} placeholder="Priya Sharma" />
                              <div className="grid grid-cols-2 gap-2">
                                <Field
                                  label="Expiry (MM/YY)"
                                  value={cardExpiry}
                                  onChange={v => setCardExpiry(v.replace(/[^\d/]/g, "").slice(0, 5))}
                                  placeholder="12/27"
                                />
                                <Field
                                  label="CVV"
                                  value={cardCvv}
                                  onChange={v => setCardCvv(v.replace(/\D/g, "").slice(0, 3))}
                                  placeholder="•••"
                                  type="password"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 mt-6">
                      <button onClick={() => setStep(2)} className="flex-1 py-3 border border-[#C9A84C]/40 text-[#7B1C2C] font-bold uppercase tracking-wider text-sm rounded-sm hover:border-[#C9A84C] transition-colors">
                        Back
                      </button>
                      <button onClick={() => setStep(4)} className="flex-1 bg-[#7B1C2C] hover:bg-[#6a1826] text-[#FAF6EE] py-3 font-bold uppercase tracking-wider text-sm rounded-sm flex items-center justify-center gap-2 transition-colors">
                        Review Order <ChevronRight size={16} />
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Step 4: Review */}
                {step === 4 && (
                  <motion.div
                    key="step4"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-4"
                  >
                    {/* Items */}
                    <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-6">
                      <h2 className="font-serif text-xl font-bold text-[#7B1C2C] mb-4">Order Items</h2>
                      <div className="space-y-4">
                        {orderItems.map(item => (
                          <div key={item.productId} className="flex gap-3 items-start">
                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                              {item.images?.[0] && (
                                <img src={item.images[0]} alt={item.name} className="w-full h-full object-cover" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm leading-snug">{item.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{item.vendorName} · Qty: {item.quantity}</p>
                              <p className="text-xs text-gray-400">₹{item.price.toLocaleString("en-IN")} each</p>
                            </div>
                            <p className="font-bold text-sm shrink-0">₹{(item.price * item.quantity).toLocaleString("en-IN")}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Coupon */}
                    <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5">
                      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-[#7B1C2C]">
                        <Tag size={14} /> Apply Coupon Code
                      </h3>
                      {appliedCoupon ? (
                        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                          <Check size={14} className="text-green-500 shrink-0" />
                          <span className="text-sm font-semibold text-green-700 flex-1">
                            {appliedCoupon.code} — {appliedCoupon.label}
                          </span>
                          <button onClick={() => setAppliedCoupon(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            value={couponCode}
                            onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                            onKeyDown={e => e.key === "Enter" && applyCoupon()}
                            placeholder="Enter coupon code"
                            className="flex-1 border border-[#C9A84C]/30 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#7B1C2C]/30 uppercase"
                          />
                          <button
                            onClick={applyCoupon}
                            className="px-5 py-2 bg-[#C9A84C] text-[#7B1C2C] font-bold text-sm rounded-lg hover:bg-[#b59539] transition-colors"
                          >
                            Apply
                          </button>
                        </div>
                      )}
                      {couponError && <p className="text-red-500 text-xs mt-1.5">{couponError}</p>}
                    </div>

                    {/* Address + Delivery summary */}
                    <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-sm text-[#7B1C2C]">Delivery Details</h3>
                        <button onClick={() => setStep(1)} className="text-xs text-[#7B1C2C] font-semibold hover:underline">Edit</button>
                      </div>
                      <p className="text-sm font-bold">{address.name} · {address.phone}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(", ")}
                      </p>
                      <div className="flex items-center gap-2 mt-3 text-xs text-gray-600 dark:text-gray-400">
                        {deliveryMethod === "express" ? <Zap size={12} className="text-[#C9A84C]" /> : <Truck size={12} className="text-[#C9A84C]" />}
                        {deliveryMethod === "express" ? "Express" : "Standard"} · Est. {getDeliveryDate(deliveryMethod)}
                        <span className="ml-auto font-semibold cursor-pointer text-[#7B1C2C] hover:underline" onClick={() => setStep(2)}>Change</span>
                      </div>
                    </div>

                    {placeError && (
                      <p className="text-red-500 text-sm text-center bg-red-50 rounded-lg py-2 px-4">{placeError}</p>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep(3)}
                        className="flex-1 py-3.5 border border-[#C9A84C]/40 text-[#7B1C2C] font-bold uppercase tracking-wider text-sm rounded-sm hover:border-[#C9A84C] transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={placeOrder}
                        disabled={placing}
                        className="flex-[2] bg-[#7B1C2C] hover:bg-[#6a1826] disabled:opacity-60 text-[#FAF6EE] py-3.5 font-bold uppercase tracking-wider text-sm rounded-sm flex items-center justify-center gap-2 transition-colors"
                      >
                        {placing ? (
                          <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Placing Order…</>
                        ) : (
                          <><Check size={16} /> Place Order · ₹{total.toLocaleString("en-IN")}</>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Price sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-6 sticky top-24">
                <h2 className="font-serif text-lg font-bold text-[#7B1C2C] mb-4">Price Details</h2>
                <div className="space-y-2.5 text-sm mb-4">
                  <div className="flex justify-between">
                    <span className="opacity-60">Subtotal ({orderItems.reduce((s, i) => s + i.quantity, 0)} items)</span>
                    <span>₹{subtotal.toLocaleString("en-IN")}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Coupon Discount</span>
                      <span>− ₹{discount.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="opacity-60">Shipping</span>
                    <span>{shippingCost === 0 ? <span className="text-green-600 font-semibold">Free</span> : `₹${shippingCost}`}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">GST (5%)</span>
                    <span>₹{gst.toLocaleString("en-IN")}</span>
                  </div>
                </div>
                <div className="border-t border-[#C9A84C]/20 pt-3 flex justify-between font-bold text-[#7B1C2C] text-base">
                  <span>Total Amount</span>
                  <span>₹{total.toLocaleString("en-IN")}</span>
                </div>
                {discount > 0 && (
                  <p className="mt-2 text-xs text-green-600 font-semibold text-center">
                    You save ₹{discount.toLocaleString("en-IN")} on this order!
                  </p>
                )}
                <div className="mt-4 pt-4 border-t border-[#C9A84C]/10 space-y-1.5 text-xs text-center text-gray-400">
                  <p>🔒 Secure & encrypted checkout</p>
                  <p>🚚 Pan India delivery</p>
                  <p>↩️ 7-day hassle-free returns</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
