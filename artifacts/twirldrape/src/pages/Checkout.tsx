import React, { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useUser } from "@clerk/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, ChevronRight, Truck, Zap, CreditCard, Smartphone,
  HandCoins, Tag, X, Loader2, CheckCircle, XCircle, Building2, Wallet as WalletIcon,
  AlertTriangle,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { useCart } from "@/context/CartContext";
import type { CartItem, StockAdjustment } from "@/context/CartContext";

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const BUY_NOW_KEY = "twirl_buy_now";

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
type PaymentMethod = "upi" | "credit_card" | "debit_card" | "net_banking" | "wallet" | "cod";

const PAYMENT_OPTIONS: Array<{
  id: PaymentMethod;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  sub: string;
}> = [
  { id: "upi", Icon: Smartphone, title: "UPI", sub: "Google Pay, PhonePe, Paytm, BHIM" },
  { id: "credit_card", Icon: CreditCard, title: "Credit Card", sub: "Visa, Mastercard, RuPay, Amex" },
  { id: "debit_card", Icon: CreditCard, title: "Debit Card", sub: "Visa, Mastercard, RuPay, Maestro" },
  { id: "net_banking", Icon: Building2, title: "Net Banking", sub: "SBI, HDFC, ICICI, Axis & more" },
  { id: "wallet", Icon: WalletIcon, title: "Wallet", sub: "Paytm, PhonePe, Amazon Pay, Mobikwik" },
  { id: "cod", Icon: HandCoins, title: "Cash on Delivery", sub: "Pay ₹50 extra when delivered" },
];

const BANK_LABELS: Record<string, string> = {
  sbi: "State Bank of India",
  hdfc: "HDFC Bank",
  icici: "ICICI Bank",
  axis: "Axis Bank",
  kotak: "Kotak Mahindra Bank",
  pnb: "Punjab National Bank",
  other: "Other Bank",
};

const WALLET_LABELS: Record<string, string> = {
  paytm: "Paytm",
  phonepe: "PhonePe",
  amazon_pay: "Amazon Pay",
  mobikwik: "Mobikwik",
};

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

function luhnCheck(num: string): boolean {
  const d = num.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = parseInt(d[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function validateExpiry(exp: string): boolean {
  const m = exp.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const mo = parseInt(m[1], 10);
  const yr = parseInt("20" + m[2], 10);
  if (mo < 1 || mo > 12) return false;
  return new Date(yr, mo - 1, 1) > new Date();
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F3F8F5] mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/30 focus:border-[#1E6B5A] transition-colors"
      />
    </div>
  );
}

export function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const { items: cartItems, clearCart, refreshStock } = useCart();

  const [step, setStep] = useState(1);
  const [buyNowItems, setBuyNowItems] = useState<CartItem[] | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [stockNotice, setStockNotice] = useState<StockAdjustment[]>([]);
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
  const [upiError, setUpiError] = useState("");

  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardErrors, setCardErrors] = useState<{
    number?: string; expiry?: string; cvv?: string; name?: string;
  }>({});

  const [bankChoice, setBankChoice] = useState("");
  const [walletChoice, setWalletChoice] = useState("");

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<null | {
    code: string; type: "percent" | "flat"; value: number; description: string; expiresAt: string | null;
  }>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponOrderError, setCouponOrderError] = useState("");

  const [pincodeStatus, setPincodeStatus] = useState<{
    loading: boolean; available?: boolean; message?: string;
  } | null>(null);
  const line1Ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!/^\d{6}$/.test(address.pincode)) { setPincodeStatus(null); return; }
    setPincodeStatus({ loading: true });
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shipping/check?pincode=${address.pincode}`);
        const data = await res.json();
        setPincodeStatus({ loading: false, available: data.available, message: data.message });
      } catch { setPincodeStatus(null); }
    }, 500);
    return () => clearTimeout(t);
  }, [address.pincode]);

  useEffect(() => {
    if (!GMAPS_KEY || !enteringNew) return;
    const scriptId = "google-maps-api";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&loading=async`;
      script.async = true;
      document.head.appendChild(script);
    }
    let ac: any = null;
    const init = () => {
      const w = window as any;
      if (!line1Ref.current || !w.google?.maps?.places) return;
      ac = new w.google.maps.places.Autocomplete(line1Ref.current, {
        componentRestrictions: { country: "in" }, fields: ["address_components"], types: ["address"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place?.address_components) return;
        let city = "", state = "", pincode = "";
        for (const comp of place.address_components) {
          if (comp.types.includes("locality")) city = comp.long_name;
          if (comp.types.includes("administrative_area_level_1")) state = comp.long_name;
          if (comp.types.includes("postal_code")) pincode = comp.long_name;
        }
        setAddress(a => ({ ...a, ...(city && { city }), ...(state && { state }), ...(pincode && { pincode }) }));
      });
    };
    const w = window as any;
    if (w.google?.maps?.places) { init(); }
    else {
      const iv = setInterval(() => { if ((window as any).google?.maps?.places) { clearInterval(iv); init(); } }, 300);
      return () => clearInterval(iv);
    }
    return () => { if (ac && (window as any).google?.maps?.event) (window as any).google.maps.event.clearInstanceListeners(ac); };
  }, [enteringNew]);

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
      if (!orderPlacedRef.current) sessionStorage.removeItem(BUY_NOW_KEY);
    };
  }, []);

  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation("/sign-in");
  }, [isLoaded, isSignedIn, setLocation]);

  async function revalidateStock(): Promise<StockAdjustment[]> {
    if (buyNowItems) {
      try {
        const ids = buyNowItems.map((i) => i.productId).join(",");
        const res = await fetch(`/api/products?ids=${encodeURIComponent(ids)}&limit=100`, {
          credentials: "include",
        });
        if (!res.ok) return [];
        const data = await res.json();
        const products: any[] = data.products ?? [];
        const stockById = new Map(products.map((p) => [p.id, p.stock ?? 0]));
        const adjustments: StockAdjustment[] = [];
        let anyChange = false;
        const next = buyNowItems.map((item) => {
          const liveStock = stockById.get(item.productId);
          if (liveStock === undefined) return item;
          const cappedQty = Math.min(item.quantity, liveStock);
          if (cappedQty !== item.quantity) {
            adjustments.push({
              productId: item.productId,
              name: item.name,
              previousQuantity: item.quantity,
              newQuantity: cappedQty,
              currentStock: liveStock,
              nowOutOfStock: liveStock === 0,
            });
          }
          if (liveStock === item.stock && cappedQty === item.quantity) return item;
          anyChange = true;
          return { ...item, stock: liveStock, quantity: cappedQty };
        });
        if (anyChange) setBuyNowItems(next);
        return adjustments;
      } catch {
        return [];
      }
    }
    return refreshStock();
  }

  const validatedRef = useRef(false);
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (validatedRef.current) return;
    const itemsToCheck = buyNowItems ?? cartItems;
    if (itemsToCheck.length === 0) return;
    validatedRef.current = true;
    revalidateStock().then((adjustments) => {
      if (adjustments.length > 0) setStockNotice(adjustments);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, buyNowItems, cartItems]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch(`/api/addresses`, { credentials: "include" })
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
  const hasOutOfStockItem = orderItems.some((i) => i.stock === 0);
  const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);

  const couponHoursLeft = appliedCoupon?.expiresAt
    ? (new Date(appliedCoupon.expiresAt).getTime() - Date.now()) / 3600000
    : null;
  const couponExpiringSoon = couponHoursLeft !== null && couponHoursLeft > 0 && couponHoursLeft <= 72;
  const couponDaysLeft = couponExpiringSoon ? Math.max(1, Math.ceil((couponHoursLeft as number) / 24)) : null;

  let discount = 0;
  if (appliedCoupon) {
    discount = appliedCoupon.type === "percent"
      ? Math.round(subtotal * appliedCoupon.value / 100)
      : Math.min(appliedCoupon.value, subtotal);
  }
  const afterDiscount = subtotal - discount;
  const shippingCost = deliveryMethod === "express" ? 499 : (afterDiscount >= 5000 ? 0 : 199);
  const gst = Math.round(shippingCost * 0.18);
  const codFee = paymentMethod === "cod" ? 50 : 0;
  const total = afterDiscount + shippingCost + gst + codFee;

  function validateAddress() {
    return (
      address.name.trim().length >= 2 &&
      /^\d{10}$/.test(address.phone.trim()) &&
      address.line1.trim().length >= 3 &&
      address.city.trim().length >= 2 &&
      address.state !== "" &&
      /^\d{6}$/.test(address.pincode)
    );
  }

  function validatePayment(): boolean {
    switch (paymentMethod) {
      case "upi":
        return /^[\w.\-]+@[\w]+$/.test(upiId.trim());
      case "credit_card":
      case "debit_card":
        return (
          luhnCheck(cardNumber) &&
          validateExpiry(cardExpiry) &&
          cardCvv.length === 3 &&
          cardName.trim().length >= 2
        );
      case "net_banking":
        return bankChoice !== "";
      case "wallet":
        return walletChoice !== "";
      case "cod":
        return true;
      default:
        return false;
    }
  }

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const res = await fetch(`/api/coupons/validate?code=${encodeURIComponent(code)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCouponError((err as any).error || "Invalid coupon code");
        return;
      }
      const data = await res.json();
      setAppliedCoupon({ code: data.code, type: data.type, value: data.value, description: data.description, expiresAt: data.expiresAt ?? null });
      setCouponCode("");
    } catch {
      setCouponError("Could not validate coupon. Please try again.");
    } finally {
      setCouponLoading(false);
    }
  }

  async function placeOrder() {
    setPlacing(true);
    setPlaceError("");
    setCouponOrderError("");
    const adjustments = await revalidateStock();
    if (adjustments.length > 0) {
      setStockNotice(adjustments);
      const blocking = adjustments.some((a) => a.nowOutOfStock);
      setPlaceError(
        blocking
          ? "One or more items in your order are no longer available. Please review your cart before placing the order."
          : "Some item quantities were reduced due to limited stock. Please review the updated order below."
      );
      setStep(4);
      setPlacing(false);
      return;
    }
    try {
      const res = await fetch(`/api/orders`, {
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
          codFee,
          total,
          isBuyNow: !!buyNowItems,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg: string = (errData as any).error || "Failed to place order";
        const isCouponRelated =
          (errData as any).couponInvalid ||
          /coupon/i.test(msg) ||
          /usage limit/i.test(msg) ||
          /already used/i.test(msg);
        if (isCouponRelated && appliedCoupon) {
          setCouponOrderError(msg);
          return;
        }
        throw new Error(msg);
      }
      const data = await res.json();
      orderPlacedRef.current = true;
      sessionStorage.removeItem(BUY_NOW_KEY);
      if (!buyNowItems) await clearCart();

      // Apply referral code if stored (best-effort, fire and forget)
      const storedRef = localStorage.getItem("td_ref_code");
      if (storedRef) {
        localStorage.removeItem("td_ref_code");
        fetch(`/api/rewards/referral/apply`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ referralCode: storedRef }),
        }).catch(() => {});
      }

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
          <h2 className="font-serif text-2xl text-[#1E6B5A]">Nothing to Checkout</h2>
          <p className="text-gray-500 text-sm">Your cart is empty.</p>
          <Link href="/" className="bg-[#1E6B5A] text-[#F3F8F5] px-8 py-3 font-bold uppercase tracking-wider text-sm rounded-sm">
            Continue Shopping
          </Link>
        </div>
      </Layout>
    );
  }

  const steps = ["Address", "Delivery", "Payment", "Review"];

  return (
    <Layout>
      <div className="min-h-screen bg-[#F3F8F5] dark:bg-[#1E2329]">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="flex items-center gap-3 mb-6 sm:mb-8">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#1E6B5A]">Checkout</h1>
            {buyNowItems && (
              <span className="text-xs bg-[#C9A84C] text-[#1E6B5A] font-bold px-2 py-1 rounded uppercase tracking-wider">Buy Now</span>
            )}
          </div>

          {/* Step indicator */}
          <div className="flex items-center mb-6 sm:mb-8 overflow-x-auto pb-1">
            {steps.map((s, i) => {
              const num = i + 1;
              const isDone = step > num;
              const isCurrent = step === num;
              return (
                <React.Fragment key={s}>
                  <button
                    onClick={() => isDone ? setStep(num) : undefined}
                    className="flex items-center gap-1.5 sm:gap-2 shrink-0"
                    disabled={!isDone}
                  >
                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm transition-colors ${
                      isDone ? "bg-green-500 text-white cursor-pointer" :
                      isCurrent ? "bg-[#1E6B5A] text-white" : "bg-gray-200 text-gray-400"
                    }`}>
                      {isDone ? <Check size={12} /> : num}
                    </div>
                    <span className={`text-xs sm:text-sm font-semibold hidden xs:block sm:block ${
                      isCurrent ? "text-[#1E6B5A]" : isDone ? "text-green-600" : "text-gray-400"
                    }`}>{s}</span>
                  </button>
                  {i < steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1.5 sm:mx-2 min-w-[12px] transition-colors ${step > num ? "bg-green-400" : "bg-gray-200"}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Main content column */}
            <div className="lg:col-span-2 min-w-0">
              <AnimatePresence mode="wait">

                {/* ── Step 1: Address ── */}
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.25 }}
                    className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5 sm:p-6"
                  >
                    <h2 className="font-serif text-xl font-bold text-[#1E6B5A] mb-5">Shipping Address</h2>

                    {savedAddresses.length > 0 && !enteringNew && (
                      <div className="mb-5 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs uppercase tracking-wider font-semibold text-gray-400">Saved Addresses</p>
                          <Link href="/account/addresses" className="text-xs font-semibold text-[#1E6B5A] hover:text-[#C9A84C] transition-colors">
                            Manage Addresses →
                          </Link>
                        </div>
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
                            className={`w-full text-left p-3.5 sm:p-4 rounded-xl border-2 transition-all ${
                              selectedSavedId === sa.id
                                ? "border-[#1E6B5A] bg-[#1E6B5A]/5"
                                : "border-[#C9A84C]/20 hover:border-[#C9A84C]/50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <p className="font-semibold text-sm">{sa.name}</p>
                                  {sa.isDefault && (
                                    <span className="text-[10px] bg-[#C9A84C]/20 text-[#1E6B5A] font-bold px-1.5 py-0.5 rounded">Default</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">{sa.phone}</p>
                                <p className="text-xs text-gray-500 truncate mt-0.5">
                                  {[sa.line1, sa.line2, sa.city, sa.state, sa.pincode].filter(Boolean).join(", ")}
                                </p>
                              </div>
                              {selectedSavedId === sa.id && <Check size={16} className="text-[#1E6B5A] shrink-0 mt-1" />}
                            </div>
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setSelectedSavedId(null);
                            setEnteringNew(true);
                            setAddress({ name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" });
                          }}
                          className="w-full py-2.5 border border-dashed border-[#C9A84C]/40 rounded-xl text-sm font-semibold text-[#1E6B5A] hover:border-[#C9A84C] hover:bg-[#C9A84C]/5 transition-all"
                        >
                          + Add a new address
                        </button>
                      </div>
                    )}

                    {(enteringNew || savedAddresses.length === 0) && (
                      <>
                        {savedAddresses.length > 0 && (
                          <div className="flex items-center justify-between mb-4">
                            <p className="text-sm font-semibold text-[#1E6B5A]">New Address</p>
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
                              className="text-xs text-[#1E6B5A] font-semibold hover:underline"
                            >
                              ← Back to saved
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Full Name *" value={address.name} onChange={v => setAddress(a => ({ ...a, name: v }))} placeholder="Priya Sharma" />
                          <Field label="Phone Number *" value={address.phone} onChange={v => setAddress(a => ({ ...a, phone: v.replace(/\D/g, "").slice(0, 10) }))} placeholder="9876543210" type="tel" />
                          <div className="sm:col-span-2">
                            <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F3F8F5] mb-1.5">
                              Address Line 1 *
                              {GMAPS_KEY && <span className="text-[10px] text-[#C9A84C] ml-1 font-normal">(type to search)</span>}
                            </label>
                            <input
                              ref={line1Ref}
                              type="text"
                              value={address.line1}
                              onChange={e => setAddress(a => ({ ...a, line1: e.target.value }))}
                              placeholder="House / Flat / Block No., Street"
                              className="w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/30 focus:border-[#1E6B5A] transition-colors"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <Field label="Address Line 2" value={address.line2} onChange={v => setAddress(a => ({ ...a, line2: v }))} placeholder="Area, Landmark (optional)" />
                          </div>
                          <Field label="City *" value={address.city} onChange={v => setAddress(a => ({ ...a, city: v }))} placeholder="Mumbai" />
                          <div>
                            <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F3F8F5] mb-1.5">State *</label>
                            <select
                              value={address.state}
                              onChange={e => setAddress(a => ({ ...a, state: e.target.value }))}
                              className="w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/30 focus:border-[#1E6B5A] transition-colors"
                            >
                              <option value="">Select State</option>
                              {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F3F8F5] mb-1.5">Pincode *</label>
                            <input
                              type="text"
                              value={address.pincode}
                              onChange={e => setAddress(a => ({ ...a, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                              placeholder="400001"
                              maxLength={6}
                              className="w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/30 focus:border-[#1E6B5A] transition-colors"
                            />
                            {pincodeStatus && (
                              <div className="flex items-center gap-1.5 mt-1.5">
                                {pincodeStatus.loading ? (
                                  <><Loader2 size={12} className="animate-spin text-gray-400" /><span className="text-xs text-gray-400">Checking delivery…</span></>
                                ) : pincodeStatus.available ? (
                                  <><CheckCircle size={12} className="text-green-500" /><span className="text-xs text-green-600 font-medium">{pincodeStatus.message}</span></>
                                ) : (
                                  <><XCircle size={12} className="text-red-400" /><span className="text-xs text-red-500">{pincodeStatus.message}</span></>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <label className="flex items-center gap-2.5 mt-4 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={saveThisAddress}
                            onChange={e => setSaveThisAddress(e.target.checked)}
                            className="w-4 h-4 accent-[#1E6B5A] cursor-pointer"
                          />
                          <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-[#1E6B5A] transition-colors">
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
                            const r = await fetch(`/api/addresses`, {
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
                      className="mt-6 w-full bg-[#1E6B5A] hover:bg-[#6a1826] disabled:opacity-50 disabled:cursor-not-allowed text-[#F3F8F5] py-3.5 font-bold uppercase tracking-wider text-sm rounded-sm flex items-center justify-center gap-2 transition-colors"
                    >
                      Continue to Delivery <ChevronRight size={16} />
                    </button>
                  </motion.div>
                )}

                {/* ── Step 2: Delivery ── */}
                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.25 }}
                    className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5 sm:p-6"
                  >
                    <h2 className="font-serif text-xl font-bold text-[#1E6B5A] mb-5">Delivery Method</h2>
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
                          className={`w-full flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-xl border-2 transition-all text-left ${
                            deliveryMethod === opt.id
                              ? "border-[#1E6B5A] bg-[#1E6B5A]/5"
                              : "border-[#C9A84C]/20 hover:border-[#C9A84C]/50"
                          }`}
                        >
                          <div className={`p-2.5 rounded-full shrink-0 ${deliveryMethod === opt.id ? "bg-[#1E6B5A] text-white" : "bg-gray-100 text-gray-500"}`}>
                            <opt.Icon size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{opt.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{opt.sub}</p>
                          </div>
                          <span className={`font-bold text-sm shrink-0 ${opt.price === "Free" ? "text-green-600" : ""}`}>{opt.price}</span>
                          {deliveryMethod === opt.id && <Check size={18} className="text-[#1E6B5A] shrink-0" />}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-3 mt-6">
                      <button onClick={() => setStep(1)} className="flex-1 py-3 border border-[#C9A84C]/40 text-[#1E6B5A] font-bold uppercase tracking-wider text-sm rounded-sm hover:border-[#C9A84C] transition-colors">
                        Back
                      </button>
                      <button onClick={() => setStep(3)} className="flex-1 bg-[#1E6B5A] hover:bg-[#6a1826] text-[#F3F8F5] py-3 font-bold uppercase tracking-wider text-sm rounded-sm flex items-center justify-center gap-2 transition-colors">
                        Continue to Payment <ChevronRight size={16} />
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 3: Payment ── */}
                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.25 }}
                    className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5 sm:p-6"
                  >
                    <h2 className="font-serif text-xl font-bold text-[#1E6B5A] mb-5">Payment Method</h2>
                    <div className="space-y-3">
                      {PAYMENT_OPTIONS.map(opt => (
                        <div key={opt.id}>
                          <button
                            onClick={() => {
                              setPaymentMethod(opt.id);
                              setUpiError("");
                              setCardErrors({});
                            }}
                            className={`w-full flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-xl border-2 transition-all text-left ${
                              paymentMethod === opt.id
                                ? "border-[#1E6B5A] bg-[#1E6B5A]/5"
                                : "border-[#C9A84C]/20 hover:border-[#C9A84C]/50"
                            }`}
                          >
                            <div className={`p-2.5 rounded-full shrink-0 ${paymentMethod === opt.id ? "bg-[#1E6B5A] text-white" : "bg-gray-100 text-gray-500"}`}>
                              <opt.Icon size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm">{opt.title}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{opt.sub}</p>
                            </div>
                            {paymentMethod === opt.id && <Check size={18} className="text-[#1E6B5A] shrink-0" />}
                          </button>

                          {/* UPI input */}
                          {paymentMethod === "upi" && opt.id === "upi" && (
                            <div className="mt-3 px-1">
                              <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F3F8F5] mb-1.5">UPI ID *</label>
                              <input
                                value={upiId}
                                onChange={e => { setUpiId(e.target.value); setUpiError(""); }}
                                onBlur={() => {
                                  if (upiId.trim() && !/^[\w.\-]+@[\w]+$/.test(upiId.trim()))
                                    setUpiError("Enter a valid UPI ID, e.g. name@okaxis");
                                }}
                                placeholder="name@okaxis"
                                className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/30 focus:border-[#1E6B5A] transition-colors ${upiError ? "border-red-400 bg-red-50" : "border-[#C9A84C]/30"}`}
                              />
                              {upiError && <p className="text-red-500 text-xs mt-1">{upiError}</p>}
                            </div>
                          )}

                          {/* Credit / Debit card fields */}
                          {(paymentMethod === "credit_card" || paymentMethod === "debit_card") && paymentMethod === opt.id && (
                            <div className="mt-3 px-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="sm:col-span-2">
                                <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F3F8F5] mb-1.5">Card Number *</label>
                                <input
                                  value={cardNumber.replace(/(.{4})/g, "$1 ").trim()}
                                  onChange={e => {
                                    setCardNumber(e.target.value.replace(/\D/g, "").slice(0, 16));
                                    setCardErrors(p => ({ ...p, number: undefined }));
                                  }}
                                  onBlur={() => {
                                    if (cardNumber && !luhnCheck(cardNumber))
                                      setCardErrors(p => ({ ...p, number: "Invalid card number" }));
                                  }}
                                  placeholder="1234 5678 9012 3456"
                                  maxLength={19}
                                  className={`w-full border rounded-lg px-3 py-2.5 text-sm tracking-widest bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/30 transition-colors ${cardErrors.number ? "border-red-400 bg-red-50" : "border-[#C9A84C]/30"}`}
                                />
                                {cardErrors.number && <p className="text-red-500 text-xs mt-1">{cardErrors.number}</p>}
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F3F8F5] mb-1.5">Name on Card *</label>
                                <input
                                  value={cardName}
                                  onChange={e => { setCardName(e.target.value); setCardErrors(p => ({ ...p, name: undefined })); }}
                                  onBlur={() => {
                                    if (cardName && cardName.trim().length < 2)
                                      setCardErrors(p => ({ ...p, name: "Enter the cardholder name" }));
                                  }}
                                  placeholder="Priya Sharma"
                                  className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/30 transition-colors ${cardErrors.name ? "border-red-400 bg-red-50" : "border-[#C9A84C]/30"}`}
                                />
                                {cardErrors.name && <p className="text-red-500 text-xs mt-1">{cardErrors.name}</p>}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F3F8F5] mb-1.5">Expiry (MM/YY) *</label>
                                  <input
                                    value={cardExpiry}
                                    onChange={e => {
                                      let v = e.target.value.replace(/[^\d/]/g, "").slice(0, 5);
                                      if (v.length === 2 && !v.includes("/") && cardExpiry.length === 1) v = v + "/";
                                      setCardExpiry(v);
                                      setCardErrors(p => ({ ...p, expiry: undefined }));
                                    }}
                                    onBlur={() => {
                                      if (cardExpiry && !validateExpiry(cardExpiry))
                                        setCardErrors(p => ({ ...p, expiry: "Invalid or expired" }));
                                    }}
                                    placeholder="12/27"
                                    maxLength={5}
                                    className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/30 transition-colors ${cardErrors.expiry ? "border-red-400 bg-red-50" : "border-[#C9A84C]/30"}`}
                                  />
                                  {cardErrors.expiry && <p className="text-red-500 text-xs mt-1">{cardErrors.expiry}</p>}
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F3F8F5] mb-1.5">CVV *</label>
                                  <input
                                    value={cardCvv}
                                    onChange={e => { setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 3)); setCardErrors(p => ({ ...p, cvv: undefined })); }}
                                    onBlur={() => {
                                      if (cardCvv && cardCvv.length < 3)
                                        setCardErrors(p => ({ ...p, cvv: "CVV must be 3 digits" }));
                                    }}
                                    placeholder="•••"
                                    type="password"
                                    maxLength={3}
                                    className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/30 transition-colors ${cardErrors.cvv ? "border-red-400 bg-red-50" : "border-[#C9A84C]/30"}`}
                                  />
                                  {cardErrors.cvv && <p className="text-red-500 text-xs mt-1">{cardErrors.cvv}</p>}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Net Banking bank selector */}
                          {paymentMethod === "net_banking" && opt.id === "net_banking" && (
                            <div className="mt-3 px-1">
                              <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F3F8F5] mb-1.5">Select Bank *</label>
                              <select
                                value={bankChoice}
                                onChange={e => setBankChoice(e.target.value)}
                                className="w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/30 focus:border-[#1E6B5A] transition-colors"
                              >
                                <option value="">Choose your bank…</option>
                                <option value="sbi">State Bank of India (SBI)</option>
                                <option value="hdfc">HDFC Bank</option>
                                <option value="icici">ICICI Bank</option>
                                <option value="axis">Axis Bank</option>
                                <option value="kotak">Kotak Mahindra Bank</option>
                                <option value="pnb">Punjab National Bank (PNB)</option>
                                <option value="other">Other Bank</option>
                              </select>
                            </div>
                          )}

                          {/* Wallet options */}
                          {paymentMethod === "wallet" && opt.id === "wallet" && (
                            <div className="mt-3 px-1">
                              <p className="text-sm font-semibold text-[#3D1A1A] dark:text-[#F3F8F5] mb-2">Select Wallet *</p>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { id: "paytm", label: "Paytm" },
                                  { id: "phonepe", label: "PhonePe" },
                                  { id: "amazon_pay", label: "Amazon Pay" },
                                  { id: "mobikwik", label: "Mobikwik" },
                                ].map(w => (
                                  <label
                                    key={w.id}
                                    className={`flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all ${walletChoice === w.id ? "border-[#1E6B5A] bg-[#1E6B5A]/5" : "border-[#C9A84C]/20 hover:border-[#C9A84C]/40"}`}
                                  >
                                    <input
                                      type="radio"
                                      name="wallet"
                                      value={w.id}
                                      checked={walletChoice === w.id}
                                      onChange={() => setWalletChoice(w.id)}
                                      className="accent-[#1E6B5A]"
                                    />
                                    <span className="text-sm font-medium">{w.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* COD note */}
                          {paymentMethod === "cod" && opt.id === "cod" && (
                            <div className="mt-3 px-1">
                              <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                <HandCoins size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-emerald-700">
                                  <span className="font-semibold">₹50 handling fee</span> will be added to your total for Cash on Delivery. Pay the full amount in cash to the delivery partner.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-3 mt-6">
                      <button onClick={() => setStep(2)} className="flex-1 py-3 border border-[#C9A84C]/40 text-[#1E6B5A] font-bold uppercase tracking-wider text-sm rounded-sm hover:border-[#C9A84C] transition-colors">
                        Back
                      </button>
                      <button
                        onClick={() => setStep(4)}
                        disabled={!validatePayment()}
                        className="flex-1 bg-[#1E6B5A] hover:bg-[#6a1826] disabled:opacity-50 disabled:cursor-not-allowed text-[#F3F8F5] py-3 font-bold uppercase tracking-wider text-sm rounded-sm flex items-center justify-center gap-2 transition-colors"
                      >
                        Review Order <ChevronRight size={16} />
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 4: Review ── */}
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
                    <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5 sm:p-6">
                      <h2 className="font-serif text-xl font-bold text-[#1E6B5A] mb-4">Order Items</h2>
                      <div className="space-y-4">
                        {orderItems.map(item => (
                          <div key={item.productId} className="flex gap-3 items-start">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                              {item.images?.[0] && (
                                <img src={item.images[0]} alt={item.name} className="w-full h-full object-cover"
                                  onError={e => { e.currentTarget.style.display = "none"; }} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm leading-snug truncate">{item.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{item.vendorName}</p>
                              <p className="text-xs text-gray-400 mt-0.5">Qty: {item.quantity} × ₹{item.price.toLocaleString("en-IN")}</p>
                            </div>
                            <p className="font-bold text-sm shrink-0">₹{(item.price * item.quantity).toLocaleString("en-IN")}</p>
                          </div>
                        ))}
                      </div>
                      {/* Per-item subtotal */}
                      <div className="border-t border-gray-100 mt-4 pt-3 flex justify-between text-sm font-semibold text-[#3D1A1A]">
                        <span>Items subtotal</span>
                        <span>₹{subtotal.toLocaleString("en-IN")}</span>
                      </div>
                    </div>

                    {/* Coupon */}
                    <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5">
                      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-[#1E6B5A]">
                        <Tag size={14} /> Apply Coupon Code
                      </h3>
                      {appliedCoupon ? (
                        <>
                          <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${couponOrderError ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
                            {couponOrderError
                              ? <XCircle size={14} className="text-red-500 shrink-0" />
                              : <Check size={14} className="text-green-500 shrink-0" />}
                            <span className={`text-sm font-semibold flex-1 ${couponOrderError ? "text-red-700" : "text-green-700"}`}>
                              {appliedCoupon.code} — {appliedCoupon.description}
                            </span>
                            <button
                              onClick={() => { setAppliedCoupon(null); setCouponOrderError(""); }}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          {couponOrderError && (
                            <div className="mt-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
                              <p className="text-xs text-red-600 mb-1.5">{couponOrderError}</p>
                              <button
                                onClick={() => { setAppliedCoupon(null); setCouponOrderError(""); }}
                                className="text-xs font-bold text-red-700 underline hover:text-red-900 transition-colors"
                              >
                                Remove coupon and continue without discount
                              </button>
                            </div>
                          )}
                          {couponExpiringSoon && (
                            <div className="mt-2 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 text-amber-800 dark:text-amber-400 text-xs">
                              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                              <span>
                                This coupon expires in {couponDaysLeft} day{couponDaysLeft !== 1 ? "s" : ""} — complete your order soon to use it.
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            value={couponCode}
                            onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                            onKeyDown={e => e.key === "Enter" && applyCoupon()}
                            placeholder="Enter coupon code"
                            className="flex-1 border border-[#C9A84C]/30 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/30 uppercase"
                          />
                          <button
                            onClick={applyCoupon}
                            disabled={couponLoading}
                            className="px-4 sm:px-5 py-2 bg-[#C9A84C] text-[#1E6B5A] font-bold text-sm rounded-lg hover:bg-[#b59539] transition-colors disabled:opacity-60"
                          >
                            {couponLoading ? "..." : "Apply"}
                          </button>
                        </div>
                      )}
                      {couponError && <p className="text-red-500 text-xs mt-1.5">{couponError}</p>}
                    </div>

                    {/* Order price breakdown */}
                    <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5">
                      <h3 className="font-semibold text-sm text-[#1E6B5A] mb-3">Price Breakdown</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Subtotal ({orderItems.reduce((s, i) => s + i.quantity, 0)} items)</span>
                          <span>₹{subtotal.toLocaleString("en-IN")}</span>
                        </div>
                        {discount > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Coupon Discount</span>
                            <span>− ₹{discount.toLocaleString("en-IN")}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-500">Shipping</span>
                          <span>{shippingCost === 0 ? <span className="text-green-600 font-semibold">Free</span> : `₹${shippingCost}`}</span>
                        </div>
                        {codFee > 0 && (
                          <div className="flex justify-between text-emerald-700">
                            <span>COD Handling Fee</span>
                            <span>₹{codFee}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-500">GST (18% on shipping)</span>
                          <span>₹{gst.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="border-t border-[#C9A84C]/20 pt-2 flex justify-between font-bold text-[#1E6B5A]">
                          <span>Total Payable</span>
                          <span>₹{total.toLocaleString("en-IN")}</span>
                        </div>
                      </div>
                      {discount > 0 && (
                        <p className="mt-2 text-xs text-green-600 font-semibold text-right">
                          You save ₹{discount.toLocaleString("en-IN")}!
                        </p>
                      )}
                    </div>

                    {/* Delivery details */}
                    <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-sm text-[#1E6B5A]">Delivery Details</h3>
                        <button onClick={() => setStep(1)} className="text-xs text-[#1E6B5A] font-semibold hover:underline">Edit</button>
                      </div>
                      <p className="text-sm font-bold">{address.name} · {address.phone}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(", ")}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-600 dark:text-gray-400">
                        {deliveryMethod === "express" ? <Zap size={12} className="text-[#C9A84C]" /> : <Truck size={12} className="text-[#C9A84C]" />}
                        {deliveryMethod === "express" ? "Express" : "Standard"} · Est. {getDeliveryDate(deliveryMethod)}
                        <button className="ml-auto font-semibold text-[#1E6B5A] hover:underline" onClick={() => setStep(2)}>Change</button>
                      </div>
                    </div>

                    {/* Payment method summary */}
                    <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-sm text-[#1E6B5A]">Payment Method</h3>
                        <button onClick={() => setStep(3)} className="text-xs text-[#1E6B5A] font-semibold hover:underline">Change</button>
                      </div>
                      <p className="text-sm font-bold">{PAYMENT_OPTIONS.find(o => o.id === paymentMethod)?.title}</p>
                      {paymentMethod === "upi" && upiId && (
                        <p className="text-xs text-gray-500 mt-0.5">{upiId}</p>
                      )}
                      {(paymentMethod === "credit_card" || paymentMethod === "debit_card") && cardNumber && (
                        <p className="text-xs text-gray-500 mt-0.5">•••• •••• •••• {cardNumber.slice(-4)}</p>
                      )}
                      {paymentMethod === "net_banking" && bankChoice && (
                        <p className="text-xs text-gray-500 mt-0.5">{BANK_LABELS[bankChoice] || bankChoice}</p>
                      )}
                      {paymentMethod === "wallet" && walletChoice && (
                        <p className="text-xs text-gray-500 mt-0.5">{WALLET_LABELS[walletChoice] || walletChoice}</p>
                      )}
                      {paymentMethod === "cod" && (
                        <p className="text-xs text-emerald-600 font-medium mt-0.5">+ ₹50 handling fee included</p>
                      )}
                    </div>

                    {stockNotice.length > 0 && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                          <div className="text-sm text-amber-800 dark:text-amber-300">
                            <p className="font-semibold mb-1">We updated your order</p>
                            <ul className="space-y-0.5 list-disc list-inside">
                              {stockNotice.map((adj) => (
                                <li key={adj.productId}>
                                  {adj.nowOutOfStock ? (
                                    <>"{adj.name}" is now out of stock.</>
                                  ) : (
                                    <>Only {adj.currentStock} left of "{adj.name}" — quantity reduced from {adj.previousQuantity} to {adj.newQuantity}.</>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {placeError && (
                      <p className="text-red-500 text-sm text-center bg-red-50 rounded-lg py-2 px-4">{placeError}</p>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep(3)}
                        className="flex-1 py-3.5 border border-[#C9A84C]/40 text-[#1E6B5A] font-bold uppercase tracking-wider text-sm rounded-sm hover:border-[#C9A84C] transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={placeOrder}
                        disabled={placing || hasOutOfStockItem}
                        title={hasOutOfStockItem ? "Remove out-of-stock items before placing your order" : undefined}
                        className="flex-[2] bg-[#1E6B5A] hover:bg-[#6a1826] disabled:opacity-60 disabled:cursor-not-allowed text-[#F3F8F5] py-3.5 font-bold uppercase tracking-wider text-sm rounded-sm flex items-center justify-center gap-2 transition-colors"
                      >
                        {placing ? (
                          <><Loader2 size={14} className="animate-spin" /> Placing Order…</>
                        ) : (
                          <><Check size={16} /> Place Order · ₹{total.toLocaleString("en-IN")}</>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>

            {/* ── Price sidebar ── */}
            <div className="lg:col-span-1 order-first lg:order-last">
              <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5 sm:p-6 lg:sticky lg:top-24">
                <h2 className="font-serif text-lg font-bold text-[#1E6B5A] mb-4">Price Details</h2>
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
                  {codFee > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>COD Handling Fee</span>
                      <span>₹{codFee}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="opacity-60">GST (18% on shipping)</span>
                    <span>₹{gst.toLocaleString("en-IN")}</span>
                  </div>
                </div>
                <div className="border-t border-[#C9A84C]/20 pt-3 flex justify-between font-bold text-[#1E6B5A] text-base">
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
