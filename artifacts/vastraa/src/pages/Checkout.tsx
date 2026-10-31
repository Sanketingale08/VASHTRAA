import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, ChevronRight, Truck, Zap, CreditCard, Smartphone,
  HandCoins, Tag, X, Loader2, CheckCircle, XCircle, Building2, Wallet as WalletIcon,
  AlertTriangle, Clock, Info, Banknote, ArrowRight, ShoppingBag, ShieldCheck, MapPin,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { CheckoutSkeleton } from "@/components/skeletons";
import { useCart } from "@/context/CartContext";
import type { CartItem, StockAdjustment } from "@/context/CartContext";
import { useToast } from "@/hooks/use-toast";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import { apiFetch } from "@/lib/api";
import { VastraaCouponCard } from "@/components/VastraaCouponCard";

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
type SavedPaymentMethod = {
  id: string;
  type: "card" | "upi";
  cardBrand?: string | null;
  last4?: string | null;
  cardholderName?: string | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  upiId?: string | null;
  isDefault: boolean;
};
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
  { id: "cod", Icon: HandCoins, title: "Cash on Delivery", sub: "Pay ₹10 handling fee when delivered" },
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

function getFullDeliveryDate(method: DeliveryMethod = "standard") {
  const date = new Date();
  const days = method === "express" ? 3 : 7;
  let count = 0;
  while (count < days) {
    date.setDate(date.getDate() + 1);
    const d = date.getDay();
    if (d !== 0 && d !== 6) count++;
  }
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
      <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F4F5F7] mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-[#C7CCD1]/30 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/30 focus:border-[#0A1F44] transition-colors"
      />
    </div>
  );
}

export function TaxBreakdownAccordion({ items }: { items: CartItem[] }) {
  const [isOpen, setIsOpen] = useState(false);

  const aggregated = items.reduce(
    (acc, item) => {
      const q = item.quantity;
      const unitCustPrice = item.price;
      const unitBase = item.basePrice ?? Math.round(unitCustPrice / 1.155);
      const unitShip = item.shippingFee ?? 100;
      const unitTaxable = unitBase + unitShip;
      const unitGst = Math.round(unitTaxable * 0.05);
      const unitCgst = Math.floor(unitGst / 2);
      const unitSgst = unitGst - unitCgst;

      acc.basePrice += unitBase * q;
      acc.shipping += unitShip * q;
      acc.taxableAmount += unitTaxable * q;
      acc.cgst += unitCgst * q;
      acc.sgst += unitSgst * q;
      acc.gstAmount += unitGst * q;
      acc.total += unitCustPrice * q;
      return acc;
    },
    { basePrice: 0, shipping: 0, taxableAmount: 0, cgst: 0, sgst: 0, gstAmount: 0, total: 0 }
  );

  return (
    <div className="mt-1.5 mb-2 border border-[#C7CCD1]/30 rounded-lg overflow-hidden bg-gray-50/80 dark:bg-[#1E2329]/80">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-1.5 flex items-center justify-between text-xs text-[#0A1F44] dark:text-[#C7CCD1] font-semibold hover:bg-gray-100 dark:hover:bg-[#2A2E35] transition-colors"
      >
        <span className="flex items-center gap-1">
          <span>📋</span> Tax breakdown
        </span>
        <span className="text-[10px] text-gray-500 font-normal">
          {isOpen ? "Hide ▲" : "Show details ▼"}
        </span>
      </button>

      {isOpen && (
        <div className="px-3 py-2 text-[11px] text-gray-600 dark:text-gray-300 space-y-1 border-t border-[#C7CCD1]/20 font-mono">
          <div className="flex justify-between">
            <span>Base price</span>
            <span>₹{aggregated.basePrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Shipping</span>
            <span>₹{aggregated.shipping.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Taxable amount</span>
            <span>₹{aggregated.taxableAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>CGST 2.5% (₹{aggregated.cgst.toFixed(2)}) + SGST 2.5% (₹{aggregated.sgst.toFixed(2)})</span>
            <span>₹{aggregated.gstAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-[#0A1F44] dark:text-[#C7CCD1] pt-1 border-t border-gray-200">
            <span>Total</span>
            <span>₹{aggregated.total.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function UpiWaitingModal({
  isOpen,
  orderId,
  upiId,
  amount,
  timeRemaining,
  status,
  errorMsg,
  isSandbox,
  onCheckStatus,
  onSimulateApproval,
  onOpenSdkCheckout,
  onClose,
  onRetry,
  onSwitchToCod,
}: {
  isOpen: boolean;
  orderId: string;
  upiId: string;
  amount: number;
  timeRemaining: number;
  status: "waiting" | "checking" | "success" | "failed";
  errorMsg?: string;
  isSandbox?: boolean;
  onCheckStatus: () => void;
  onSimulateApproval?: () => Promise<void>;
  onOpenSdkCheckout?: () => void;
  onClose: () => void;
  onRetry: () => void;
  onSwitchToCod: () => void;
}) {
  const [simulating, setSimulating] = useState(false);

  if (!isOpen) return null;

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const handleSimulate = async () => {
    if (!onSimulateApproval) return;
    setSimulating(true);
    try {
      await onSimulateApproval();
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white dark:bg-[#1E2329] rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full border border-[#C7CCD1]/20 p-5 sm:p-7 relative overflow-hidden max-h-[90vh] overflow-y-auto pb-safe"
      >
        {/* Top gradient accent line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0A1F44] via-[#8B2635] to-[#D4AF37]" />

        {status === "success" ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 flex items-center justify-center shadow-inner">
              <CheckCircle size={36} className="animate-bounce" />
            </div>
            <h3 className="text-xl font-bold font-serif text-[#0A1F44] dark:text-gray-100">
              Payment Approved!
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Your UPI payment of <span className="font-bold text-[#0A1F44] dark:text-white">₹{amount.toLocaleString("en-IN")}</span> was verified successfully.
            </p>
            <p className="text-xs text-gray-500 animate-pulse">Redirecting to order confirmation…</p>
          </div>
        ) : status === "failed" ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 flex items-center justify-center shrink-0">
                <XCircle size={28} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Payment Unsuccessful</h3>
                <p className="text-xs text-gray-500">Order #{orderId}</p>
              </div>
            </div>

            <div className="p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
              {errorMsg || "The payment request was declined, timed out, or cancelled in your UPI app."}
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={onRetry}
                className="w-full py-3 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white font-bold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <Smartphone size={16} /> Retry UPI Payment
              </button>
              <button
                type="button"
                onClick={onSwitchToCod}
                className="w-full py-2.5 border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <HandCoins size={15} /> Switch to Cash on Delivery (Pay on Delivery)
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Return to Checkout (Cart is preserved)
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header with live timer */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Cashfree UPI Collect
                </span>
                <h3 className="text-lg font-bold font-serif text-[#0A1F44] dark:text-gray-100 mt-1">
                  Approve Payment in App
                </h3>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg text-amber-700 dark:text-amber-300 font-mono text-xs font-bold">
                <Clock size={13} className="animate-spin text-amber-600" style={{ animationDuration: "8s" }} />
                <span>{timeFormatted}</span>
              </div>
            </div>

            {/* Sandbox Notice & Instant Simulation Card */}
            {isSandbox && (
              <div className="p-3.5 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
                    <span>🧪</span> Sandbox Test Mode
                  </span>
                  <span className="text-[10px] bg-amber-200/80 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-semibold px-2 py-0.5 rounded-full">
                    No Phone Alert Sent
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-relaxed">
                  Real UPI apps (Google Pay / PhonePe) <strong>do not receive real bank push notifications in Cashfree Sandbox</strong> because test requests do not route through live NPCI banking servers.
                </p>
                {onSimulateApproval && (
                  <button
                    type="button"
                    onClick={handleSimulate}
                    disabled={simulating || status === "checking"}
                    className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60"
                  >
                    {simulating ? (
                      <><Loader2 size={14} className="animate-spin" /> Simulating Bank Approval…</>
                    ) : (
                      <><Zap size={14} className="text-yellow-200 fill-yellow-200" /> ⚡ Approve Payment in Sandbox</>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Amount and VPA Summary Card */}
            <div className="p-4 bg-gray-50 dark:bg-[#2A2E35] rounded-xl border border-[#C7CCD1]/20 space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Amount to Pay</span>
                <span className="font-semibold text-gray-700 dark:text-gray-200">Order #{orderId}</span>
              </div>
              <div className="text-2xl font-bold font-serif text-[#0A1F44] dark:text-white">
                ₹{amount.toLocaleString("en-IN")}
              </div>
              <div className="pt-2 border-t border-[#C7CCD1]/10 flex items-center justify-between text-xs">
                <span className="text-gray-500">Request Sent To:</span>
                <span className="font-mono font-bold text-[#0A1F44] dark:text-blue-300 bg-white dark:bg-[#1E2329] px-2 py-0.5 rounded border border-[#C7CCD1]/30">
                  {upiId}
                </span>
              </div>
            </div>

            {/* Instruction Steps */}
            <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#0A1F44] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                <p>Open your UPI app (<span className="font-semibold text-[#0A1F44] dark:text-white">Google Pay, PhonePe, Paytm, or BHIM</span>) on your phone.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#0A1F44] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                <p>Check the notification for a payment request of <span className="font-semibold">₹{amount.toLocaleString("en-IN")}</span> from <span className="font-semibold text-[#0A1F44] dark:text-white">VASTRAA</span>.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#0A1F44] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                <p>Enter your secret UPI PIN to approve the transaction.</p>
              </div>
            </div>

            {/* Pulsing indicator */}
            <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium bg-blue-50/70 dark:bg-blue-950/40 rounded-lg border border-blue-100 dark:border-blue-900/40">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
              </span>
              Waiting for payment confirmation from bank…
            </div>

            {/* Cashfree SDK popup alternative */}
            {onOpenSdkCheckout && (
              <button
                type="button"
                onClick={onOpenSdkCheckout}
                className="w-full py-2 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <CreditCard size={13} /> Open Cashfree Checkout Modal (Cards / Net Banking / QR)
              </button>
            )}

            {/* Action buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={onCheckStatus}
                disabled={status === "checking"}
                className="w-full py-3 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white font-bold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
              >
                {status === "checking" ? (
                  <><Loader2 size={15} className="animate-spin" /> Verifying with Bank…</>
                ) : (
                  <><Check size={16} /> I Have Approved Payment</>
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel / Choose Another Payment Method
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoading: authLoading, user } = useAuth();
  const isLoaded = !authLoading;
  const { items: cartItems, clearCart, refreshStock } = useCart();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [buyNowItems, setBuyNowItems] = useState<CartItem[] | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [stockNotice, setStockNotice] = useState<StockAdjustment[]>([]);
  const orderPlacedRef = React.useRef(false);
  // Tracks whether the shopper has actively chosen a payment method; prevents
  // the async saved-methods fetch from overwriting an already-made choice.
  const paymentChoiceMadeRef = React.useRef(false);

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

  // UPI Waiting Modal State
  const [upiModalOpen, setUpiModalOpen] = useState(false);
  const [upiModalData, setUpiModalData] = useState<{
    orderId: string;
    total: number;
    upiId: string;
    cfOrderId?: string;
    paymentSessionId?: string;
    isSandbox?: boolean;
  } | null>(null);
  const [upiModalTimeRemaining, setUpiModalTimeRemaining] = useState(300);
  const [upiModalStatus, setUpiModalStatus] = useState<"waiting" | "checking" | "success" | "failed">("waiting");
  const [upiModalError, setUpiModalError] = useState<string>("");

  const upiPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const upiTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopUpiPolling = useCallback(() => {
    if (upiPollIntervalRef.current) {
      clearInterval(upiPollIntervalRef.current);
      upiPollIntervalRef.current = null;
    }
    if (upiTimerIntervalRef.current) {
      clearInterval(upiTimerIntervalRef.current);
      upiTimerIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopUpiPolling();
    };
  }, [stopUpiPolling]);

  const checkUpiPaymentStatus = useCallback(async (orderId: string, isManual = false) => {
    if (isManual) setUpiModalStatus("checking");
    try {
      const res = await apiFetch(`/api/payments/cashfree/verify-order/${orderId}`);
      const data = await res.json().catch(() => ({}));

      if (data.paid || data.paymentStatus === "paid") {
        stopUpiPolling();
        setUpiModalStatus("success");
        orderPlacedRef.current = true;
        sessionStorage.removeItem(BUY_NOW_KEY);
        if (!buyNowItems) await clearCart();
        setTimeout(() => {
          setLocation(`/orders/${orderId}`);
        }, 1200);
        return true;
      }

      if (data.paymentStatus === "failed" || data.status === "payment_failed") {
        stopUpiPolling();
        setUpiModalStatus("failed");
        setUpiModalError(data.message || "Payment attempt was declined or cancelled in your UPI app.");
        return false;
      }

      if (isManual) {
        setUpiModalStatus("waiting");
        toast({
          title: "Payment Pending",
          description: "Payment is still awaiting approval. If testing in Sandbox, click 'Approve Payment in Sandbox'.",
        });
      }
      return false;
    } catch (err: any) {
      if (isManual) {
        setUpiModalStatus("waiting");
        toast({
          title: "Status Check",
          description: err?.message || "Payment is still pending in your UPI app.",
        });
      }
      return false;
    }
  }, [buyNowItems, clearCart, setLocation, stopUpiPolling, toast]);

  const simulateUpiPayment = useCallback(async () => {
    if (!upiModalData?.orderId) return;
    setUpiModalStatus("checking");
    try {
      const res = await apiFetch(`/api/payments/cashfree/simulate-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: upiModalData.orderId, paymentStatus: "SUCCESS" }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success || data.paymentStatus === "paid") {
        stopUpiPolling();
        setUpiModalStatus("success");
        orderPlacedRef.current = true;
        sessionStorage.removeItem(BUY_NOW_KEY);
        if (!buyNowItems) await clearCart();
        toast({
          title: "Sandbox Payment Approved",
          description: "Payment was successfully simulated and verified in Cashfree sandbox.",
        });
        setTimeout(() => {
          setLocation(`/orders/${upiModalData.orderId}`);
        }, 1200);
      } else {
        throw new Error(data.message || data.error || "Simulation failed");
      }
    } catch (err: any) {
      toast({
        title: "Simulation Failed",
        description: err?.message || "Failed to simulate payment approval",
        variant: "destructive",
      });
      setUpiModalStatus("waiting");
    }
  }, [upiModalData, stopUpiPolling, buyNowItems, clearCart, setLocation, toast]);

  const openCashfreeSdkCheckout = useCallback(async () => {
    if (!upiModalData?.paymentSessionId || !upiModalData?.orderId) return;
    try {
      stopUpiPolling();
      const cashfreeLib = (window as any).Cashfree;
      if (!cashfreeLib) {
        toast({ title: "SDK Loading", description: "Payment gateway SDK is still loading. Please try again.", variant: "destructive" });
        return;
      }
      const cashfree = cashfreeLib({
        mode: upiModalData.isSandbox ? "sandbox" : "production",
      });
      await cashfree.checkout({
        paymentSessionId: upiModalData.paymentSessionId,
        redirectTarget: "_modal",
      });
      checkUpiPaymentStatus(upiModalData.orderId, true);
    } catch (err: any) {
      toast({
        title: "Cashfree Modal Error",
        description: err?.message || "Failed to open payment modal",
        variant: "destructive",
      });
    }
  }, [upiModalData, stopUpiPolling, checkUpiPaymentStatus, toast]);

  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardErrors, setCardErrors] = useState<{
    number?: string; expiry?: string; cvv?: string; name?: string;
  }>({});

  const [bankChoice, setBankChoice] = useState("");
  const [walletChoice, setWalletChoice] = useState("");

  // Saved payment methods (loaded for signed-in users)
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const [savedMethodsLoaded, setSavedMethodsLoaded] = useState(false);
  const [selectedSavedMethodId, setSelectedSavedMethodId] = useState<string | null>(null);
  const [savePaymentMethod, setSavePaymentMethod] = useState(false);

  const [savedMethodError, setSavedMethodError] = useState("");

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<null | {
    code: string;
    type: "percent" | "flat";
    value: number;
    description: string;
    expiresAt: string | null;
    offerDisplayText?: string | null;
    minimumOrderValue?: number | null;
    maxDiscountAmount?: number | null;
    discount?: number | null;
  }>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponOrderError, setCouponOrderError] = useState("");
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [availableCouponsList, setAvailableCouponsList] = useState<any[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);

  const fetchAvailableCoupons = useCallback(async () => {
    try {
      setLoadingCoupons(true);
      const res = await apiFetch("/api/coupons/available");
      if (res.ok) {
        const data = await res.json();
        setAvailableCouponsList(data.coupons || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingCoupons(false);
    }
  }, []);

  const [pincodeStatus, setPincodeStatus] = useState<{
    loading: boolean; available?: boolean; message?: string;
  } | null>(null);
  const line1Ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!/^\d{6}$/.test(address.pincode)) { setPincodeStatus(null); return; }
    setPincodeStatus({ loading: true });
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/shipping/check?pincode=${address.pincode}`);
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
        const res = await apiFetch(`/api/products?ids=${encodeURIComponent(ids)}&limit=100`);
        if (!res.ok) return [];
        const data = await res.json();
        const products: any[] = data.products ?? [];
        const liveProductMap = new Map(products.map((p) => [p.id, p]));
        const adjustments: StockAdjustment[] = [];
        let anyChange = false;

        const next = buyNowItems.map((item) => {
          const liveProd = liveProductMap.get(item.productId);
          if (!liveProd) return item;

          const liveStock = liveProd.stock ?? 0;
          const livePrice = liveProd.price ?? item.price;
          const liveOrigPrice = liveProd.originalPrice ?? null;
          const liveName = liveProd.name || item.name;
          const liveImages = Array.isArray(liveProd.images) && liveProd.images.length > 0 ? liveProd.images : item.images;

          const cappedQty = Math.min(item.quantity, liveStock);
          if (cappedQty !== item.quantity) {
            adjustments.push({
              productId: item.productId,
              name: liveName,
              previousQuantity: item.quantity,
              newQuantity: cappedQty,
              currentStock: liveStock,
              nowOutOfStock: liveStock === 0,
            });
          }

          const priceChanged = livePrice !== item.price || liveOrigPrice !== item.originalPrice;
          const nameChanged = liveName !== item.name;
          const stockChanged = liveStock !== item.stock || cappedQty !== item.quantity;

          if (!priceChanged && !nameChanged && !stockChanged) return item;

          anyChange = true;
          return {
            ...item,
            name: liveName,
            price: livePrice,
            originalPrice: liveOrigPrice,
            images: liveImages,
            stock: liveStock,
            quantity: cappedQty,
          };
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
    apiFetch(`/api/addresses`)
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

  // Fetch saved payment methods once for signed-in users
  useEffect(() => {
    if (!isLoaded || !isSignedIn || savedMethodsLoaded) return;
    setSavedMethodsLoaded(true);
    apiFetch("/api/payment-methods")
      .then(r => r.ok ? r.json() : { paymentMethods: [] })
      .then(data => {
        const methods: SavedPaymentMethod[] = data.paymentMethods ?? [];
        setSavedPaymentMethods(methods);
        // Only pre-select the default if the shopper hasn't already chosen manually
        if (!paymentChoiceMadeRef.current) {
          const def = methods.find(m => m.isDefault);
          if (def) {
            setSelectedSavedMethodId(def.id);
            if (def.type === "upi") {
              setPaymentMethod("upi");
              setUpiId(def.upiId ?? "");
            } else {
              setPaymentMethod("credit_card");
            }
          }
        }
      })
      .catch(() => {});
  }, [isLoaded, isSignedIn, savedMethodsLoaded]);

  const orderItems = buyNowItems ?? cartItems;
  const hasOutOfStockItem = orderItems.some((i) => i.stock === 0);
  const totalQuantity = orderItems.reduce((s, i) => s + i.quantity, 0);
  const totalMRP = orderItems.reduce((s, i) => s + Math.max(i.originalPrice ?? 0, i.price) * i.quantity, 0);
  const totalSellingPrice = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const mrpDiscount = Math.max(0, totalMRP - totalSellingPrice);
  const platformFee = 20; // Fixed ₹20 per order
  const codFee = paymentMethod === "cod" ? 10 : 0; // Fixed ₹10 for COD
  const shippingCost = 0; // Always FREE

  const couponHoursLeft = appliedCoupon?.expiresAt
    ? (new Date(appliedCoupon.expiresAt).getTime() - Date.now()) / 3600000
    : null;
  const couponExpiringSoon = couponHoursLeft !== null && couponHoursLeft > 0 && couponHoursLeft <= 72;
  const couponDaysLeft = couponExpiringSoon ? Math.max(1, Math.ceil((couponHoursLeft as number) / 24)) : null;

  let couponDiscount = 0;
  if (appliedCoupon) {
    if (typeof appliedCoupon.discount === "number" && appliedCoupon.discount > 0) {
      couponDiscount = appliedCoupon.discount;
    } else {
      couponDiscount = appliedCoupon.type === "percent"
        ? Math.round(totalSellingPrice * appliedCoupon.value / 100)
        : Math.min(appliedCoupon.value, totalSellingPrice);
    }
    if (appliedCoupon.maxDiscountAmount && couponDiscount > appliedCoupon.maxDiscountAmount) {
      couponDiscount = appliedCoupon.maxDiscountAmount;
    }
  }

  // Auto-remove coupon if subtotal drops below minimum order value after cart updates
  useEffect(() => {
    if (appliedCoupon?.minimumOrderValue && totalSellingPrice < appliedCoupon.minimumOrderValue) {
      const removedCode = appliedCoupon.code;
      const requiredMov = appliedCoupon.minimumOrderValue;
      setAppliedCoupon(null);
      toast({
        title: "Coupon Removed",
        description: `Coupon ${removedCode} requires a minimum order of ₹${requiredMov.toLocaleString("en-IN")}. Add more items to re-apply.`,
        variant: "destructive",
      });
    }
  }, [appliedCoupon, totalSellingPrice, toast]);
  const subtotal = totalSellingPrice;
  const discount = couponDiscount;
  const afterDiscount = subtotal - discount;
  const gst = 0;
  const total = totalSellingPrice - couponDiscount + platformFee + codFee;

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
    // A saved payment method is always valid — server already holds the details
    if (selectedSavedMethodId !== null) return true;
    switch (paymentMethod) {
      case "upi":
        return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim());
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

  async function applyCoupon(overrideCode?: string) {
    const raw = typeof overrideCode === "string" ? overrideCode : couponCode;
    const code = raw.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const res = await apiFetch(`/api/coupons/validate?code=${encodeURIComponent(code)}&subtotal=${totalSellingPrice}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCouponError((err as any).error || "Invalid coupon code");
        return;
      }
      const data = await res.json();
      setAppliedCoupon({
        code: data.code,
        type: data.type || data.discountType,
        value: data.value || data.discountValue,
        description: data.description,
        offerDisplayText: data.offerDisplayText ?? null,
        expiresAt: data.expiresAt ?? null,
        minimumOrderValue: data.minimumOrderValue ?? null,
        maxDiscountAmount: data.maxDiscountAmount ?? null,
        discount: data.discount ?? null,
      });
      setCouponCode("");
      setShowCouponModal(false);
    } catch {
      setCouponError("Could not validate coupon. Please try again.");
    } finally {
      setCouponLoading(false);
    }
  }

  async function placeOrder() {
    if (placing) return;
    setPlacing(true);
    setPlaceError("");
    setCouponOrderError("");
    setSavedMethodError("");

    // Validate authentication session
    const token = localStorage.getItem("vastraa_auth_token") || localStorage.getItem("clerk_user_id");
    if (!token && user?.id) {
      localStorage.setItem("vastraa_auth_token", user.id);
    }

    // Validate delivery address
    if (!validateAddress()) {
      setPlaceError("Please provide a complete delivery address with a valid 6-digit PIN code.");
      setStep(1);
      setPlacing(false);
      return;
    }

    // Validate cart
    if (orderItems.length === 0) {
      setPlaceError("Your cart is empty. Please add items before placing an order.");
      setPlacing(false);
      return;
    }

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

    // ─── 1. Cash on Delivery (COD) Flow ─────────────────────────────────────────
    if (paymentMethod === "cod") {
      try {
        const res = await apiFetch(`/api/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: orderItems.map((i) => ({
              productId: i.productId,
              name: i.name,
              price: i.price,
              quantity: i.quantity,
              images: i.images,
              vendorName: i.vendorName,
            })),
            address,
            deliveryMethod,
            paymentMethod: "cod",
            couponCode: appliedCoupon?.code ?? null,
            subtotal,
            discount: couponDiscount,
            platformFee,
            shipping: 0,
            tax: 0,
            codFee: 10,
            total,
            isBuyNow: !!buyNowItems,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to place COD order");
        }

        const data = await res.json();
        orderPlacedRef.current = true;
        sessionStorage.removeItem(BUY_NOW_KEY);
        if (!buyNowItems) await clearCart();

        // Apply referral code if stored (best-effort)
        const storedRef = localStorage.getItem("td_ref_code");
        if (storedRef) {
          localStorage.removeItem("td_ref_code");
          apiFetch(`/api/rewards/referral/apply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ referralCode: storedRef }),
          }).catch(() => {});
        }

        const targetId = data.order?.id || data.orderId || data.id;
        setLocation(`/orders/${targetId}`);
        return;
      } catch (err: any) {
        setPlaceError(err?.message || "Failed to place Cash on Delivery order. Please try again.");
        setPlacing(false);
        return;
      } finally {
        setPlacing(false);
      }
    }

    // ─── 2. UPI Flow (Cashfree UPI Collect + Polling) ───────────────────────────
    if (paymentMethod === "upi") {
      try {
        // Step 1: Create Cashfree PG Order
        const cfRes = await apiFetch(`/api/payments/cashfree/create-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: orderItems.map((i) => ({
              productId: i.productId,
              name: i.name,
              price: i.price,
              quantity: i.quantity,
            })),
            address,
            deliveryMethod,
            couponCode: appliedCoupon?.code ?? null,
            isBuyNow: !!buyNowItems,
          }),
        });

        if (!cfRes.ok) {
          const errData = await cfRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to initialize payment gateway order");
        }

        const cfData = await cfRes.json();
        const createdOrderId = cfData.orderId;

        // Step 2: Initiate UPI Collect Request
        const upiRes = await apiFetch(`/api/payments/cashfree/pay-upi`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: createdOrderId,
            upiId: upiId.trim(),
          }),
        });

        const upiData = await upiRes.json().catch(() => ({}));

        // Handle merchant account fallback if collect channel restricted
        if (upiData.action === "sdk_fallback") {
          const cashfreeLib = (window as any).Cashfree;
          if (!cashfreeLib) {
            throw new Error("Cashfree payment gateway SDK is loading. Please try again.");
          }
          const cashfree = cashfreeLib({
            mode: cfData.env === "production" ? "production" : "sandbox",
          });
          await cashfree.checkout({
            paymentSessionId: cfData.paymentSessionId,
            redirectTarget: "_modal",
          });

          // Verify after modal closes
          const verifyRes = await apiFetch(`/api/payments/cashfree/verify-order/${createdOrderId}`);
          const verifyData = await verifyRes.json().catch(() => ({}));
          if (verifyRes.ok && (verifyData.paid || verifyData.paymentStatus === "paid")) {
            orderPlacedRef.current = true;
            sessionStorage.removeItem(BUY_NOW_KEY);
            if (!buyNowItems) await clearCart();
            setLocation(`/orders/${createdOrderId}`);
            setPlacing(false);
            return;
          } else {
            throw new Error(verifyData.message || verifyData.error || "Payment verification incomplete.");
          }
        }

        if (!upiRes.ok && !upiData.success) {
          throw new Error(upiData.error || upiData.message || "Failed to initiate UPI collect request");
        }

        // Save payment method if selected
        if (savePaymentMethod && selectedSavedMethodId === null && /^[\w.\-]+@[\w]+$/.test(upiId.trim())) {
          apiFetch(`/api/payment-methods`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "upi", upiId: upiId.trim() }),
          }).catch(() => {});
        }

        // Apply referral code if stored
        const storedRef = localStorage.getItem("td_ref_code");
        if (storedRef) {
          localStorage.removeItem("td_ref_code");
          apiFetch(`/api/rewards/referral/apply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ referralCode: storedRef }),
          }).catch(() => {});
        }

        // Step 3: Open UPI Waiting Modal & Start Polling
        setUpiModalData({
          orderId: createdOrderId,
          total,
          upiId: upiId.trim(),
          cfOrderId: cfData.cfOrderId,
          paymentSessionId: cfData.paymentSessionId,
          isSandbox: cfData.env !== "production" || upiData.env !== "production",
        });
        setUpiModalTimeRemaining(300);
        setUpiModalStatus("waiting");
        setUpiModalError("");
        setUpiModalOpen(true);
        setPlacing(false);

        stopUpiPolling();
        upiTimerIntervalRef.current = setInterval(() => {
          setUpiModalTimeRemaining((prev) => {
            if (prev <= 1) {
              stopUpiPolling();
              setUpiModalStatus("failed");
              setUpiModalError("Payment session timed out (5 minutes). Please retry or choose Cash on Delivery.");
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        upiPollIntervalRef.current = setInterval(() => {
          checkUpiPaymentStatus(createdOrderId);
        }, 3000);

        return;
      } catch (err: any) {
        setPlaceError(err?.message || "UPI payment initiation failed. Please check your UPI ID or choose Cash on Delivery.");
        setPlacing(false);
        return;
      }
    }

    // ─── 3. Other Online Payment Methods (Card, Net Banking, Wallet) ─────────────
    try {
      const cfRes = await apiFetch(`/api/payments/cashfree/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: orderItems.map((i) => ({
            productId: i.productId,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
          })),
          address,
          deliveryMethod,
          couponCode: appliedCoupon?.code ?? null,
          isBuyNow: !!buyNowItems,
        }),
      });

      if (!cfRes.ok) {
        const errData = await cfRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to initialize payment gateway");
      }

      const cfData = await cfRes.json();
      const cashfreeLib = (window as any).Cashfree;
      if (!cashfreeLib) {
        throw new Error("Cashfree payment gateway SDK is loading. Please try again in a few moments.");
      }

      const cashfree = cashfreeLib({
        mode: cfData.env === "production" ? "production" : "sandbox",
      });

      // Open Cashfree checkout modal
      await cashfree.checkout({
        paymentSessionId: cfData.paymentSessionId,
        redirectTarget: "_modal",
      });

      // Authoritatively verify order with backend
      const verifyRes = await apiFetch(`/api/payments/cashfree/verify-order/${cfData.orderId}`);
      const verifyData = await verifyRes.json().catch(() => ({}));

      if (verifyRes.ok && (verifyData.paid || verifyData.paymentStatus === "paid")) {
        orderPlacedRef.current = true;
        sessionStorage.removeItem(BUY_NOW_KEY);
        if (!buyNowItems) await clearCart();

        // Save card method if requested
        if (savePaymentMethod && selectedSavedMethodId === null && (paymentMethod === "credit_card" || paymentMethod === "debit_card")) {
          const [expMo, expYr] = cardExpiry.split("/");
          apiFetch(`/api/payment-methods`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "card",
              cardNumber,
              cardholderName: cardName,
              expiryMonth: parseInt(expMo, 10),
              expiryYear: parseInt("20" + expYr, 10),
              cvv: cardCvv,
            }),
          }).catch(() => {});
        }

        setLocation(`/orders/${cfData.orderId}`);
        setPlacing(false);
        return;
      }

      throw new Error(
        verifyData.message ||
        verifyData.error ||
        "Payment verification incomplete. If money was deducted, it will be automatically reconciled."
      );
    } catch (err: any) {
      setPlaceError(err?.message || "Online payment failed. Please try again or choose Cash on Delivery.");
      setPlacing(false);
      return;
    } finally {
      setPlacing(false);
    }
  }

  if (!isLoaded) {
    return (
      <Layout>
        <CheckoutSkeleton />
      </Layout>
    );
  }
  if (!isSignedIn) return null;

  if (orderItems.length === 0) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-4">
          <h2 className="font-serif text-2xl text-[#0A1F44]">Nothing to Checkout</h2>
          <p className="text-gray-500 text-sm">Your cart is empty.</p>
          <Link href="/" className="bg-[#0A1F44] text-[#F4F5F7] px-8 py-3 font-bold uppercase tracking-wider text-sm rounded-sm">
            Continue Shopping
          </Link>
        </div>
      </Layout>
    );
  }

  const steps = ["Address", "Delivery", "Payment", "Review"];

  return (
    <Layout>
      <div className="min-h-screen bg-[#F4F5F7] dark:bg-[#1E2329]">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="flex items-center gap-3 mb-6 sm:mb-8">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#0A1F44]">Checkout</h1>
            {buyNowItems && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs bg-[#C7CCD1] text-[#0A1F44] font-bold px-2.5 py-1 rounded uppercase tracking-wider">Buy Now Mode</span>
                {cartItems.length > 0 && (
                  <button
                    onClick={() => {
                      sessionStorage.removeItem(BUY_NOW_KEY);
                      setBuyNowItems(null);
                    }}
                    className="text-xs text-[#0A1F44] dark:text-[#C7CCD1] font-semibold underline hover:text-[#2C3E6B] transition-colors"
                  >
                    Switch to full cart ({cartItems.length} items)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Step indicator */}
          <div className="mb-6 sm:mb-8 bg-white dark:bg-[#2A2E35] rounded-2xl border border-[#C7CCD1]/30 dark:border-gray-700/60 p-4 sm:p-5 shadow-xs">
            <div className="xs:hidden mb-2.5 flex items-center justify-between text-xs">
              <span className="font-bold text-[#0A1F44] dark:text-[#E5E8EC]">
                Step {step} of 4: <span className="font-medium text-[#0A1F44] dark:text-blue-300">{steps[step - 1]}</span>
              </span>
              <span className="text-[11px] font-semibold text-[#0A1F44] bg-[#0A1F44]/10 dark:text-blue-300 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">{Math.round((step / 4) * 100)}% Complete</span>
            </div>
            <div className="flex items-center overflow-x-auto scroll-touch scrollbar-none pb-1 min-w-0">
              {steps.map((s, i) => {
                const num = i + 1;
                const isDone = step > num;
                const isCurrent = step === num;
                const canJump = isDone || (validateAddress() && num !== step);
                return (
                  <React.Fragment key={s}>
                    <button
                      onClick={() => (canJump ? setStep(num) : undefined)}
                      className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-h-[44px] min-w-[44px] group"
                      disabled={!canJump}
                    >
                      <div
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm transition-all duration-200 ${
                          isDone
                            ? "bg-emerald-600 text-white shadow-xs cursor-pointer group-hover:bg-emerald-700"
                            : isCurrent
                            ? "bg-[#0A1F44] text-white shadow-sm ring-4 ring-[#0A1F44]/20"
                            : canJump
                            ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer group-hover:bg-gray-300"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                        }`}
                      >
                        {isDone ? <Check size={14} className="stroke-[2.5]" /> : num}
                      </div>
                      <span
                        className={`text-xs sm:text-sm hidden xs:block sm:block transition-colors ${
                          isCurrent
                            ? "text-[#0A1F44] dark:text-[#E5E8EC] font-bold"
                            : isDone
                            ? "text-emerald-700 dark:text-emerald-400 font-medium group-hover:text-emerald-800"
                            : "text-gray-400 font-normal"
                        }`}
                      >
                        {s}
                      </span>
                    </button>
                    {i < steps.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mx-2 sm:mx-3 min-w-[16px] transition-colors duration-300 ${
                          step > num ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700"
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
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
                    className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C7CCD1]/20 p-5 sm:p-6"
                  >
                    <h2 className="font-serif text-xl font-bold text-[#0A1F44] mb-5">Shipping Address</h2>

                    {savedAddresses.length > 0 && !enteringNew && (
                      <div className="mb-5 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs uppercase tracking-wider font-semibold text-gray-400">Saved Addresses</p>
                          <Link href="/account/addresses" className="text-xs font-semibold text-[#0A1F44] hover:text-[#C7CCD1] transition-colors">
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
                                ? "border-[#0A1F44] bg-[#0A1F44]/5"
                                : "border-[#C7CCD1]/20 hover:border-[#C7CCD1]/50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <p className="font-semibold text-sm">{sa.name}</p>
                                  {sa.isDefault && (
                                    <span className="text-[10px] bg-[#C7CCD1]/20 text-[#0A1F44] font-bold px-1.5 py-0.5 rounded">Default</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">{sa.phone}</p>
                                <p className="text-xs text-gray-500 truncate mt-0.5">
                                  {[sa.line1, sa.line2, sa.city, sa.state, sa.pincode].filter(Boolean).join(", ")}
                                </p>
                              </div>
                              {selectedSavedId === sa.id && <Check size={16} className="text-[#0A1F44] shrink-0 mt-1" />}
                            </div>
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setSelectedSavedId(null);
                            setEnteringNew(true);
                            setAddress({ name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" });
                          }}
                          className="w-full py-2.5 border border-dashed border-[#C7CCD1]/40 rounded-xl text-sm font-semibold text-[#0A1F44] hover:border-[#C7CCD1] hover:bg-[#C7CCD1]/5 transition-all"
                        >
                          + Add a new address
                        </button>
                      </div>
                    )}

                    {(enteringNew || savedAddresses.length === 0) && (
                      <>
                        {savedAddresses.length > 0 && (
                          <div className="flex items-center justify-between mb-4">
                            <p className="text-sm font-semibold text-[#0A1F44]">New Address</p>
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
                              className="text-xs text-[#0A1F44] font-semibold hover:underline"
                            >
                              ← Back to saved
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Full Name *" value={address.name} onChange={v => setAddress(a => ({ ...a, name: v }))} placeholder="Priya Sharma" />
                          <Field label="Phone Number *" value={address.phone} onChange={v => setAddress(a => ({ ...a, phone: v.replace(/\D/g, "").slice(0, 10) }))} placeholder="9876543210" type="tel" />
                          <div className="sm:col-span-2">
                            <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F4F5F7] mb-1.5">
                              Address Line 1 *
                              {GMAPS_KEY && <span className="text-[10px] text-[#C7CCD1] ml-1 font-normal">(type to search)</span>}
                            </label>
                            <input
                              ref={line1Ref}
                              type="text"
                              value={address.line1}
                              onChange={e => setAddress(a => ({ ...a, line1: e.target.value }))}
                              placeholder="House / Flat / Block No., Street"
                              className="w-full border border-[#C7CCD1]/30 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/30 focus:border-[#0A1F44] transition-colors"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <Field label="Address Line 2" value={address.line2} onChange={v => setAddress(a => ({ ...a, line2: v }))} placeholder="Area, Landmark (optional)" />
                          </div>
                          <Field label="City *" value={address.city} onChange={v => setAddress(a => ({ ...a, city: v }))} placeholder="Mumbai" />
                          <div>
                            <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F4F5F7] mb-1.5">State *</label>
                            <select
                              value={address.state}
                              onChange={e => setAddress(a => ({ ...a, state: e.target.value }))}
                              className="w-full border border-[#C7CCD1]/30 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/30 focus:border-[#0A1F44] transition-colors"
                            >
                              <option value="">Select State</option>
                              {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F4F5F7] mb-1.5">Pincode *</label>
                            <input
                              type="text"
                              value={address.pincode}
                              onChange={e => setAddress(a => ({ ...a, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                              placeholder="400001"
                              maxLength={6}
                              className="w-full border border-[#C7CCD1]/30 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/30 focus:border-[#0A1F44] transition-colors"
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
                            className="w-4 h-4 accent-[#0A1F44] cursor-pointer"
                          />
                          <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-[#0A1F44] transition-colors">
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
                            const r = await apiFetch(`/api/addresses`, {
                              method: "POST",
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
                      className="mt-6 w-full bg-[#0A1F44] hover:bg-[#2C3E6B] disabled:opacity-50 disabled:cursor-not-allowed text-[#F4F5F7] py-3.5 font-bold uppercase tracking-wider text-sm rounded-sm flex items-center justify-center gap-2 transition-colors"
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
                    className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C7CCD1]/20 p-5 sm:p-6"
                  >
                    <h2 className="font-serif text-xl font-bold text-[#0A1F44] mb-5">Delivery Method</h2>
                    <div className="space-y-3">
                      {([
                        {
                          id: "standard" as const,
                          Icon: Truck,
                          title: "Standard Delivery",
                          sub: `7 business days · Est. ${getDeliveryDate("standard")}`,
                          price: "Free",
                        },
                        {
                          id: "express" as const,
                          Icon: Zap,
                          title: "Express Delivery",
                          sub: `3 business days · Est. ${getDeliveryDate("express")}`,
                          price: "Free",
                        },
                      ]).map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => setDeliveryMethod(opt.id)}
                          className={`w-full flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-xl border-2 transition-all text-left ${
                            deliveryMethod === opt.id
                              ? "border-[#0A1F44] bg-[#0A1F44]/5"
                              : "border-[#C7CCD1]/20 hover:border-[#C7CCD1]/50"
                          }`}
                        >
                          <div className={`p-2.5 rounded-full shrink-0 ${deliveryMethod === opt.id ? "bg-[#0A1F44] text-white" : "bg-gray-100 text-gray-500"}`}>
                            <opt.Icon size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{opt.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{opt.sub}</p>
                          </div>
                          <span className={`font-bold text-sm shrink-0 ${opt.price === "Free" ? "text-green-600" : ""}`}>{opt.price}</span>
                          {deliveryMethod === opt.id && <Check size={18} className="text-[#0A1F44] shrink-0" />}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-3 mt-6">
                      <button onClick={() => setStep(1)} className="flex-1 py-3 border border-[#C7CCD1]/40 text-[#0A1F44] font-bold uppercase tracking-wider text-sm rounded-sm hover:border-[#C7CCD1] transition-colors">
                        Back
                      </button>
                      <button onClick={() => setStep(3)} className="flex-1 bg-[#0A1F44] hover:bg-[#2C3E6B] text-[#F4F5F7] py-3 font-bold uppercase tracking-wider text-sm rounded-sm flex items-center justify-center gap-2 transition-colors">
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
                    className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C7CCD1]/20 p-5 sm:p-6"
                  >
                    <h2 className="font-serif text-xl font-bold text-[#0A1F44] mb-5">Payment Method</h2>

                    {savedMethodError && (
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mb-4">
                        <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-red-600 dark:text-red-400">{savedMethodError}</p>
                      </div>
                    )}

                    {/* ── Saved payment methods (signed-in users only) ── */}
                    {isSignedIn && savedPaymentMethods.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Saved Methods</p>
                        <div className="space-y-2">
                          {savedPaymentMethods.map(m => {
                            const selected = selectedSavedMethodId === m.id;
                            return (
                              <button
                                key={m.id}
                                onClick={() => {
                                  paymentChoiceMadeRef.current = true;
                                  setSelectedSavedMethodId(m.id);
                                  setSavePaymentMethod(false);
                                  setSavedMethodError("");
                                  setUpiError("");
                                  setCardErrors({});
                                  if (m.type === "upi") {
                                    setPaymentMethod("upi");
                                    setUpiId(m.upiId ?? "");
                                  } else {
                                    setPaymentMethod("credit_card");
                                  }
                                }}
                                className={`w-full flex items-center gap-3 sm:gap-4 p-3.5 rounded-xl border-2 transition-all text-left ${
                                  selected
                                    ? "border-[#0A1F44] bg-[#0A1F44]/5"
                                    : "border-[#C7CCD1]/20 hover:border-[#C7CCD1]/50"
                                }`}
                              >
                                <div className={`p-2.5 rounded-full shrink-0 ${selected ? "bg-[#0A1F44] text-white" : "bg-gray-100 text-gray-500"}`}>
                                  {m.type === "upi" ? <Smartphone size={18} /> : <CreditCard size={18} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  {m.type === "card" ? (
                                    <>
                                      <p className="font-semibold text-sm">
                                        {m.cardBrand ?? "Card"}
                                        <span className="font-mono ml-1.5 text-gray-500">•••• {m.last4}</span>
                                      </p>
                                      <p className="text-xs text-gray-400 mt-0.5">
                                        {m.cardholderName} · Exp {String(m.expiryMonth).padStart(2,"0")}/{String(m.expiryYear).slice(-2)}
                                      </p>
                                    </>
                                  ) : (
                                    <>
                                      <p className="font-semibold text-sm font-mono">{m.upiId}</p>
                                      <p className="text-xs text-gray-400 mt-0.5">UPI</p>
                                    </>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {m.isDefault && (
                                    <span className="text-[10px] font-bold text-[#0A1F44] bg-[#0A1F44]/10 px-2 py-0.5 rounded-full border border-[#0A1F44]/20">
                                      Default
                                    </span>
                                  )}
                                  {selected && <Check size={18} className="text-[#0A1F44]" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-3 my-4">
                          <div className="flex-1 h-px bg-gray-100" />
                          <span className="text-xs text-gray-400 font-medium">or add a new method</span>
                          <div className="flex-1 h-px bg-gray-100" />
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {PAYMENT_OPTIONS.map(opt => (
                        <div key={opt.id}>
                          <button
                            onClick={() => {
                              paymentChoiceMadeRef.current = true;
                              setPaymentMethod(opt.id);
                              setSelectedSavedMethodId(null);
                              setSavePaymentMethod(false);
                              setSavedMethodError("");
                              setUpiId("");
                              setUpiError("");
                              setCardErrors({});
                            }}
                            className={`w-full flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-xl border-2 transition-all text-left ${
                              paymentMethod === opt.id && selectedSavedMethodId === null
                                ? "border-[#0A1F44] bg-[#0A1F44]/5"
                                : "border-[#C7CCD1]/20 hover:border-[#C7CCD1]/50"
                            }`}
                          >
                            <div className={`p-2.5 rounded-full shrink-0 ${paymentMethod === opt.id && selectedSavedMethodId === null ? "bg-[#0A1F44] text-white" : "bg-gray-100 text-gray-500"}`}>
                              <opt.Icon size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm">{opt.title}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{opt.sub}</p>
                            </div>
                            {paymentMethod === opt.id && selectedSavedMethodId === null && <Check size={18} className="text-[#0A1F44] shrink-0" />}
                          </button>

                          {/* UPI input — only when manually entering (no saved method selected) */}
                          {paymentMethod === "upi" && opt.id === "upi" && selectedSavedMethodId === null && (
                            <div className="mt-3 px-1">
                              <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F4F5F7] mb-1.5">
                                UPI ID / VPA *
                              </label>
                              <input
                                value={upiId}
                                onChange={e => { setUpiId(e.target.value); setUpiError(""); }}
                                onBlur={() => {
                                  if (upiId.trim() && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim()))
                                    setUpiError("Enter a valid UPI ID, e.g. username@okhdfcbank or 9876543210@paytm");
                                }}
                                placeholder="username@okhdfcbank"
                                className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/30 focus:border-[#0A1F44] transition-colors ${upiError ? "border-red-400 bg-red-50" : "border-[#C7CCD1]/30"}`}
                              />
                              {upiError && <p className="text-red-500 text-xs mt-1">{upiError}</p>}

                              {/* Popular handle chips */}
                              <div className="mt-2.5">
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5 font-medium">Quick Handles / Test VPAs:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {[
                                    { handle: "testsuccess@gocash", label: "Sandbox Auto-Approve", isFullVpa: true },
                                    { handle: "@okhdfcbank", label: "GPay" },
                                    { handle: "@okaxis", label: "GPay" },
                                    { handle: "@ybl", label: "PhonePe" },
                                    { handle: "@ibl", label: "PhonePe" },
                                    { handle: "@paytm", label: "Paytm" },
                                    { handle: "@upi", label: "BHIM" },
                                  ].map((chip) => (
                                    <button
                                      key={chip.handle}
                                      type="button"
                                      onClick={() => {
                                        if ((chip as any).isFullVpa) {
                                          setUpiId(chip.handle);
                                        } else {
                                          const cleanPrefix = upiId.includes("@") ? upiId.split("@")[0] : upiId;
                                          setUpiId((cleanPrefix || "") + chip.handle);
                                        }
                                        setUpiError("");
                                      }}
                                      className={`text-[10px] px-2 py-0.5 rounded border font-mono transition-colors ${
                                        (chip as any).isFullVpa
                                          ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-bold"
                                          : "border-[#C7CCD1]/40 bg-gray-50 dark:bg-[#1E2329] hover:bg-gray-100 dark:hover:bg-[#2A2E35] text-gray-700 dark:text-gray-300"
                                      }`}
                                    >
                                      {chip.handle} <span className="text-gray-400">({chip.label})</span>
                                    </button>
                                  ))}
                                </div>
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2 bg-amber-50/70 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200/50">
                                  💡 <strong>Sandbox Tip:</strong> In test mode, real UPI apps do not receive real bank push notifications. You can use <button type="button" onClick={() => { setUpiId("testsuccess@gocash"); setUpiError(""); }} className="underline font-mono font-bold">testsuccess@gocash</button> for instant auto-approval, or enter your UPI ID and click "Approve Payment in Sandbox" on the waiting screen.
                                </p>
                              </div>

                              <label className="flex items-center gap-2.5 mt-3 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={savePaymentMethod}
                                  onChange={e => setSavePaymentMethod(e.target.checked)}
                                  className="w-4 h-4 accent-[#0A1F44] cursor-pointer"
                                />
                                <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-[#0A1F44] transition-colors">
                                  Save for future purchases
                                </span>
                              </label>
                            </div>
                          )}

                          {/* Credit / Debit card fields — only when manually entering */}
                          {(paymentMethod === "credit_card" || paymentMethod === "debit_card") && paymentMethod === opt.id && selectedSavedMethodId === null && (
                            <div className="mt-3 px-1">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="sm:col-span-2">
                                  <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F4F5F7] mb-1.5">Card Number *</label>
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
                                    className={`w-full border rounded-lg px-3 py-2.5 text-sm tracking-widest bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/30 transition-colors ${cardErrors.number ? "border-red-400 bg-red-50" : "border-[#C7CCD1]/30"}`}
                                  />
                                  {cardErrors.number && <p className="text-red-500 text-xs mt-1">{cardErrors.number}</p>}
                                </div>
                                <div>
                                  <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F4F5F7] mb-1.5">Name on Card *</label>
                                  <input
                                    value={cardName}
                                    onChange={e => { setCardName(e.target.value); setCardErrors(p => ({ ...p, name: undefined })); }}
                                    onBlur={() => {
                                      if (cardName && cardName.trim().length < 2)
                                        setCardErrors(p => ({ ...p, name: "Enter the cardholder name" }));
                                    }}
                                    placeholder="Priya Sharma"
                                    className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/30 transition-colors ${cardErrors.name ? "border-red-400 bg-red-50" : "border-[#C7CCD1]/30"}`}
                                  />
                                  {cardErrors.name && <p className="text-red-500 text-xs mt-1">{cardErrors.name}</p>}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F4F5F7] mb-1.5">Expiry (MM/YY) *</label>
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
                                      className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/30 transition-colors ${cardErrors.expiry ? "border-red-400 bg-red-50" : "border-[#C7CCD1]/30"}`}
                                    />
                                    {cardErrors.expiry && <p className="text-red-500 text-xs mt-1">{cardErrors.expiry}</p>}
                                  </div>
                                  <div>
                                    <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F4F5F7] mb-1.5">CVV *</label>
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
                                      className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/30 transition-colors ${cardErrors.cvv ? "border-red-400 bg-red-50" : "border-[#C7CCD1]/30"}`}
                                    />
                                    {cardErrors.cvv && <p className="text-red-500 text-xs mt-1">{cardErrors.cvv}</p>}
                                  </div>
                                </div>
                              </div>
                              <label className="flex items-center gap-2.5 mt-3 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={savePaymentMethod}
                                  onChange={e => setSavePaymentMethod(e.target.checked)}
                                  className="w-4 h-4 accent-[#0A1F44] cursor-pointer"
                                />
                                <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-[#0A1F44] transition-colors">
                                  Save for future purchases
                                </span>
                              </label>
                            </div>
                          )}

                          {/* Net Banking bank selector — only when manually entering */}
                          {paymentMethod === "net_banking" && opt.id === "net_banking" && selectedSavedMethodId === null && (
                            <div className="mt-3 px-1">
                              <label className="block text-sm font-semibold text-[#3D1A1A] dark:text-[#F4F5F7] mb-1.5">Select Bank *</label>
                              <select
                                value={bankChoice}
                                onChange={e => setBankChoice(e.target.value)}
                                className="w-full border border-[#C7CCD1]/30 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/30 focus:border-[#0A1F44] transition-colors"
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

                          {/* Wallet options — only when manually entering */}
                          {paymentMethod === "wallet" && opt.id === "wallet" && selectedSavedMethodId === null && (
                            <div className="mt-3 px-1">
                              <p className="text-sm font-semibold text-[#3D1A1A] dark:text-[#F4F5F7] mb-2">Select Wallet *</p>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { id: "paytm", label: "Paytm" },
                                  { id: "phonepe", label: "PhonePe" },
                                  { id: "amazon_pay", label: "Amazon Pay" },
                                  { id: "mobikwik", label: "Mobikwik" },
                                ].map(w => (
                                  <label
                                    key={w.id}
                                    className={`flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all ${walletChoice === w.id ? "border-[#0A1F44] bg-[#0A1F44]/5" : "border-[#C7CCD1]/20 hover:border-[#C7CCD1]/40"}`}
                                  >
                                    <input
                                      type="radio"
                                      name="wallet"
                                      value={w.id}
                                      checked={walletChoice === w.id}
                                      onChange={() => setWalletChoice(w.id)}
                                      className="accent-[#0A1F44]"
                                    />
                                    <span className="text-sm font-medium">{w.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* COD note — only when manually selected */}
                          {paymentMethod === "cod" && opt.id === "cod" && selectedSavedMethodId === null && (
                            <div className="mt-3 px-1">
                              <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                <HandCoins size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-emerald-700">
                                  <span className="font-semibold">₹10 handling fee</span> will be added to your total for Cash on Delivery. Pay the full amount in cash to the delivery partner.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-3 mt-6">
                      <button onClick={() => setStep(2)} className="flex-1 py-3 border border-[#C7CCD1]/40 text-[#0A1F44] font-bold uppercase tracking-wider text-sm rounded-sm hover:border-[#C7CCD1] transition-colors">
                        Back
                      </button>
                      <button
                        onClick={() => setStep(4)}
                        disabled={!validatePayment()}
                        className="flex-1 bg-[#0A1F44] hover:bg-[#2C3E6B] disabled:opacity-50 disabled:cursor-not-allowed text-[#F4F5F7] py-3 font-bold uppercase tracking-wider text-sm rounded-sm flex items-center justify-center gap-2 transition-colors"
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
                    className="space-y-6"
                  >
                    {/* 1. Order Review / Items Card */}
                    <div className="bg-white dark:bg-[#2A2E35] rounded-2xl border border-[#C7CCD1]/30 dark:border-gray-700/60 p-5 sm:p-7 shadow-xs">
                      <div className="flex items-center justify-between gap-4 mb-5 pb-4 border-b border-[#C7CCD1]/20 dark:border-gray-700/40">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#0A1F44]/10 text-[#0A1F44] dark:bg-white/10 dark:text-[#C7CCD1] flex items-center justify-center shrink-0">
                            <ShoppingBag size={20} />
                          </div>
                          <div>
                            <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#0A1F44] dark:text-[#E5E8EC] leading-tight">
                              Order Items
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {totalQuantity} {totalQuantity === 1 ? "handcrafted item" : "handcrafted items"} ready for dispatch
                            </p>
                          </div>
                        </div>

                        <Link
                          href="/cart"
                          className="text-xs font-semibold text-[#0A1F44] hover:text-[#2C3E6B] dark:text-blue-400 hover:underline shrink-0 flex items-center gap-1"
                        >
                          Edit Items
                        </Link>
                      </div>

                      <div className="divide-y divide-[#C7CCD1]/20 dark:divide-gray-700/40">
                        {orderItems.map((item) => {
                          const itemVariant = (item as any).variant || (item as any).selectedVariant || [
                            (item as any).size && `Size: ${(item as any).size}`,
                            (item as any).color && `Color: ${(item as any).color}`,
                          ].filter(Boolean).join(" · ");

                          return (
                            <div key={item.productId} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-4">
                              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-[#FAF7F2] dark:bg-[#1E2329] border border-[#C7CCD1]/30 dark:border-gray-700/60 shrink-0 relative shadow-xs flex items-center justify-center">
                                <img
                                  src={getProductImageSrc(item.images?.[0])}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  onError={replaceProductImageWithFallback}
                                />
                              </div>

                              <div className="flex-1 min-w-0">
                                <h3 className="font-serif font-bold text-base sm:text-lg text-[#0A1F44] dark:text-[#F4F5F7] leading-snug line-clamp-2">
                                  {item.name}
                                </h3>

                                {item.vendorName && (
                                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    <Building2 size={13} className="text-[#D4AF37] shrink-0" />
                                    <span>
                                      Sold by <strong className="text-gray-700 dark:text-gray-200 font-medium">{item.vendorName}</strong>
                                    </span>
                                  </div>
                                )}

                                {itemVariant && (
                                  <div className="mt-1.5">
                                    <span className="inline-block text-[11px] font-medium bg-[#FAF7F2] dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-[#C7CCD1]/40 dark:border-gray-700 px-2.5 py-0.5 rounded-full">
                                      {itemVariant}
                                    </span>
                                  </div>
                                )}

                                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-gray-500 dark:text-gray-400 mt-2">
                                  <span>Qty: <strong className="font-semibold text-[#0A1F44] dark:text-white">{item.quantity}</strong></span>
                                  <span className="text-gray-300 dark:text-gray-600">·</span>
                                  <span>Unit Price: <span className="font-medium text-gray-700 dark:text-gray-300">₹{item.price.toLocaleString("en-IN")}</span></span>
                                </div>
                              </div>

                              <div className="text-left sm:text-right shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#C7CCD1]/10 flex sm:flex-col justify-between items-center sm:items-end">
                                <span className="text-xs text-gray-400 sm:block">Item Total</span>
                                <span className="font-serif font-bold text-base sm:text-lg text-[#0A1F44] dark:text-[#F4F5F7]">
                                  ₹{(item.price * item.quantity).toLocaleString("en-IN")}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Items Subtotal Footer */}
                      <div className="border-t border-[#C7CCD1]/20 dark:border-gray-700/40 mt-5 pt-3.5 flex justify-between items-center text-sm">
                        <span className="text-gray-600 dark:text-gray-300 font-medium">
                          Items Subtotal ({totalQuantity} {totalQuantity === 1 ? "item" : "items"})
                        </span>
                        <span className="font-serif font-bold text-[#0A1F44] dark:text-white text-base">
                          ₹{subtotal.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>

                    {/* 2. Delivery Information & Method Card */}
                    <div className="bg-white dark:bg-[#2A2E35] rounded-2xl border border-[#C7CCD1]/30 dark:border-gray-700/60 p-5 sm:p-7 shadow-xs">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#0A1F44]/10 text-[#0A1F44] dark:bg-white/10 dark:text-[#C7CCD1] flex items-center justify-center shrink-0">
                            <Truck size={20} />
                          </div>
                          <div>
                            <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#0A1F44] dark:text-[#E5E8EC] leading-tight">
                              Delivery Method
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              Reliable doorstep delivery across India
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="text-xs font-semibold text-[#0A1F44] hover:text-[#2C3E6B] dark:text-blue-400 hover:underline shrink-0"
                        >
                          Edit Address
                        </button>
                      </div>

                      {/* Delivery Speed Detail */}
                      <div className="bg-[#FAF7F2] dark:bg-[#1E2329]/70 rounded-xl p-4 border border-[#C7CCD1]/20 dark:border-gray-700/40">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="font-semibold text-sm text-[#0A1F44] dark:text-white">
                              {deliveryMethod === "express" ? "Express (3 Days)" : "Standard (7 Days)"}
                            </span>
                            <span className="text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                              FREE
                            </span>
                          </div>

                          <div className="text-xs text-gray-600 dark:text-gray-300">
                            <span className="text-gray-500 dark:text-gray-400">Est. delivery by </span>
                            <span className="font-bold text-[#0A1F44] dark:text-white">
                              {getFullDeliveryDate(deliveryMethod)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-[#C7CCD1]/20 dark:border-gray-700/40 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                          <span>
                            Delivery speed: <strong className="text-gray-700 dark:text-gray-200 capitalize">{deliveryMethod} Delivery</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => setDeliveryMethod((m) => (m === "standard" ? "express" : "standard"))}
                            className="text-[11px] text-[#0A1F44] dark:text-blue-400 font-semibold hover:underline"
                          >
                            Switch to {deliveryMethod === "standard" ? "Express (3 Days)" : "Standard (7 Days)"}
                          </button>
                        </div>
                      </div>

                      {/* Shipping Address Details Box */}
                      <div className="mt-4 p-4 rounded-xl border border-[#C7CCD1]/30 dark:border-gray-700/50 bg-white dark:bg-[#1E2329]/40 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-sm sm:text-base text-[#0A1F44] dark:text-white flex items-center gap-1.5">
                            <MapPin size={15} className="text-[#0A1F44] dark:text-blue-400" />
                            {address.name}
                          </p>
                          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                            PIN {address.pincode}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                          {address.line1}{address.line2 ? `, ${address.line2}` : ""}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                          {address.city}, {address.state} — {address.pincode}
                        </p>
                        {address.phone && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 pt-1 flex items-center gap-1.5">
                            <Smartphone size={13} className="text-gray-400" />
                            Phone: <span className="font-medium text-gray-700 dark:text-gray-200">+91 {address.phone}</span>
                          </p>
                        )}
                        <p className="text-[11px] text-gray-400 pt-1 border-t border-[#C7CCD1]/10">
                          Deliver to: <strong className="text-gray-700 dark:text-gray-300">{address.name}</strong> ({address.pincode}) · {[address.line1, address.city].filter(Boolean).join(", ")}
                        </p>
                      </div>
                    </div>

                    {/* 3. Payment Method Card */}
                    <div className="bg-white dark:bg-[#2A2E35] rounded-2xl border border-[#C7CCD1]/30 dark:border-gray-700/60 p-5 sm:p-7 shadow-xs">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#0A1F44]/10 text-[#0A1F44] dark:bg-white/10 dark:text-[#C7CCD1] flex items-center justify-center shrink-0">
                            <CreditCard size={20} />
                          </div>
                          <div>
                            <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#0A1F44] dark:text-[#E5E8EC] leading-tight">
                              Payment Method
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              Choose your preferred payment method
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>100% Secure Checkout</span>
                        </div>
                      </div>

                      {/* Payment Selection Options */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethod("cod");
                            setSelectedSavedMethodId(null);
                          }}
                          className={`p-3.5 rounded-xl border text-left transition-all ${
                            paymentMethod === "cod"
                              ? "border-[#D4AF37] bg-[#FAF7F2]/60 dark:bg-[#1E2329] shadow-xs ring-1 ring-[#D4AF37]/50"
                              : "border-[#C7CCD1]/30 dark:border-gray-700 hover:border-gray-400 opacity-70"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${paymentMethod === "cod" ? "border-[#0A1F44]" : "border-gray-400"}`}>
                              {paymentMethod === "cod" && <div className="w-2 h-2 rounded-full bg-[#0A1F44]" />}
                            </div>
                            <span className="font-semibold text-xs sm:text-sm text-[#0A1F44] dark:text-[#E5E8EC]">
                              Cash on Delivery
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (paymentMethod === "cod") {
                              setPaymentMethod("upi");
                            }
                          }}
                          className={`p-3.5 rounded-xl border text-left transition-all ${
                            paymentMethod !== "cod"
                              ? "border-[#D4AF37] bg-[#FAF7F2]/60 dark:bg-[#1E2329] shadow-xs ring-1 ring-[#D4AF37]/50"
                              : "border-[#C7CCD1]/30 dark:border-gray-700 hover:border-gray-400 opacity-70"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${paymentMethod !== "cod" ? "border-[#0A1F44]" : "border-gray-400"}`}>
                              {paymentMethod !== "cod" && <div className="w-2 h-2 rounded-full bg-[#0A1F44]" />}
                            </div>
                            <span className="font-semibold text-xs sm:text-sm text-[#0A1F44] dark:text-[#E5E8EC]">
                              UPI / Online
                            </span>
                          </div>
                        </button>
                      </div>

                      {/* Active Bordered Payment Card */}
                      {paymentMethod === "cod" ? (
                        <div className="border border-[#D4AF37] dark:border-[#D4AF37]/90 rounded-xl p-4 sm:p-5 bg-white dark:bg-[#1E2329] shadow-[0_2px_12px_rgba(212,175,55,0.08)] transition-all">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            {/* Left: Radio indicator + Icon + Label */}
                            <div className="flex items-center gap-3.5">
                              <div className="w-5 h-5 rounded-full border-2 border-[#0A1F44] flex items-center justify-center shrink-0">
                                <div className="w-2.5 h-2.5 rounded-full bg-[#0A1F44]" />
                              </div>
                              <div className="w-10 h-10 rounded-full bg-[#FAF7F2] dark:bg-[#25282E] border border-[#D4AF37]/40 flex items-center justify-center text-[#B38F48] dark:text-[#D4AF37] shrink-0">
                                <Banknote size={20} />
                              </div>
                              <div>
                                <p className="font-semibold text-base text-[#0A1F44] dark:text-white">
                                  Cash on Delivery
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  Pay via cash or UPI at the time of delivery
                                </p>
                              </div>
                            </div>

                            {/* Right: Prominent Place Order / Pay Now Button */}
                            <button
                              type="button"
                              onClick={placeOrder}
                              disabled={placing || hasOutOfStockItem}
                              aria-label="Place Order (Pay Now)"
                              title={hasOutOfStockItem ? "Remove out-of-stock items before placing your order" : undefined}
                              className="bg-[#0A1F44] hover:bg-[#2C3E6B] active:bg-[#071630] focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/40 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium sm:font-semibold px-7 py-3.5 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 min-w-[160px] w-full sm:w-auto shrink-0"
                            >
                              {placing ? (
                                <>
                                  <Loader2 size={16} className="animate-spin" />
                                  <span>Placing Order...</span>
                                </>
                              ) : (
                                <>
                                  <span>Place Order</span>
                                  <span className="sr-only"> (Pay Now)</span>
                                  <ArrowRight size={16} />
                                </>
                              )}
                            </button>
                          </div>

                          {/* Information panel below payment card */}
                          <div className="mt-4 bg-[#FAF7F2] dark:bg-[#25282E]/90 rounded-xl p-3.5 sm:p-4 border border-[#D4AF37]/40 dark:border-[#D4AF37]/30 flex items-start gap-3">
                            <Info size={18} className="text-[#B38F48] dark:text-[#D4AF37] shrink-0 mt-0.5" />
                            <p className="text-xs sm:text-sm text-[#0A1F44]/90 dark:text-gray-300 leading-relaxed">
                              Amount due on delivery: <strong className="font-bold text-[#0A1F44] dark:text-white">₹{total.toLocaleString("en-IN")}</strong>. Payment will be collected when the order is delivered.
                            </p>
                          </div>
                        </div>
                      ) : (
                        /* Online / UPI Selected Payment Card */
                        <div className="border border-[#D4AF37] dark:border-[#D4AF37]/90 rounded-xl p-4 sm:p-5 bg-white dark:bg-[#1E2329] shadow-[0_2px_12px_rgba(212,175,55,0.08)] transition-all space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            {/* Left: Radio indicator + Icon + Label */}
                            <div className="flex items-center gap-3.5">
                              <div className="w-5 h-5 rounded-full border-2 border-[#0A1F44] flex items-center justify-center shrink-0">
                                <div className="w-2.5 h-2.5 rounded-full bg-[#0A1F44]" />
                              </div>
                              <div className="w-10 h-10 rounded-full bg-[#FAF7F2] dark:bg-[#25282E] border border-[#D4AF37]/40 flex items-center justify-center text-[#B38F48] dark:text-[#D4AF37] shrink-0">
                                {paymentMethod === "upi" ? <Smartphone size={20} /> : <CreditCard size={20} />}
                              </div>
                              <div>
                                <p className="font-semibold text-base text-[#0A1F44] dark:text-white">
                                  {paymentMethod === "upi" ? "UPI Payment" : "Cards & Net Banking"}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  Instant online payment via Cashfree Gateway
                                </p>
                              </div>
                            </div>

                            {/* Right: Prominent Pay Now -> Button */}
                            <button
                              type="button"
                              onClick={placeOrder}
                              disabled={placing || hasOutOfStockItem || (paymentMethod === "upi" && !upiId.trim())}
                              aria-label="Pay Now"
                              title={hasOutOfStockItem ? "Remove out-of-stock items before placing your order" : undefined}
                              className="bg-[#0A1F44] hover:bg-[#2C3E6B] active:bg-[#071630] focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/40 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium sm:font-semibold px-7 py-3.5 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 min-w-[160px] w-full sm:w-auto shrink-0"
                            >
                              {placing ? (
                                <>
                                  <Loader2 size={16} className="animate-spin" />
                                  <span>Processing...</span>
                                </>
                              ) : (
                                <>
                                  <span>Pay Now</span>
                                  <ArrowRight size={16} />
                                </>
                              )}
                            </button>
                          </div>

                          {/* UPI Input if UPI selected */}
                          {paymentMethod === "upi" && (
                            <div className="pt-3 border-t border-[#C7CCD1]/20 dark:border-gray-700">
                              <label className="block text-xs font-semibold text-[#0A1F44] dark:text-gray-200 mb-1.5">
                                Enter UPI ID / VPA *
                              </label>
                              <div className="flex gap-2">
                                <input
                                  value={upiId}
                                  onChange={(e) => {
                                    setUpiId(e.target.value);
                                    setUpiError("");
                                  }}
                                  placeholder="username@okhdfcbank or 9876543210@paytm"
                                  className={`flex-1 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/30 focus:border-[#0A1F44] ${
                                    upiError ? "border-red-400 bg-red-50" : "border-[#C7CCD1]/30"
                                  }`}
                                />
                              </div>
                              {upiError && <p className="text-red-500 text-xs mt-1">{upiError}</p>}

                              {/* Quick Handles */}
                              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                <span className="text-[11px] text-gray-400">Quick Test/Handles:</span>
                                {[
                                  { handle: "testsuccess@gocash", label: "Instant Test" },
                                  { handle: "@okhdfcbank", label: "GPay" },
                                  { handle: "@ybl", label: "PhonePe" },
                                  { handle: "@paytm", label: "Paytm" },
                                ].map((h) => (
                                  <button
                                    key={h.handle}
                                    type="button"
                                    onClick={() => {
                                      if (h.handle.includes("@") && !h.handle.startsWith("@")) {
                                        setUpiId(h.handle);
                                      } else {
                                        const prefix = upiId.includes("@") ? upiId.split("@")[0] : (upiId || "user");
                                        setUpiId(prefix + h.handle);
                                      }
                                      setUpiError("");
                                    }}
                                    className="text-[10px] px-2 py-0.5 rounded border border-[#C7CCD1]/40 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-[#0A1F44]"
                                  >
                                    {h.handle}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Information panel */}
                          <div className="bg-[#FAF7F2] dark:bg-[#25282E]/90 rounded-xl p-3.5 sm:p-4 border border-[#D4AF37]/40 dark:border-[#D4AF37]/30 flex items-start gap-3">
                            <Info size={18} className="text-[#B38F48] dark:text-[#D4AF37] shrink-0 mt-0.5" />
                            <p className="text-xs sm:text-sm text-[#0A1F44]/90 dark:text-gray-300 leading-relaxed">
                              Total payable: <strong className="font-bold text-[#0A1F44] dark:text-white">₹{total.toLocaleString("en-IN")}</strong>. Secure payment processed through Cashfree Gateway.
                            </p>
                          </div>

                          {/* Supported Gateway Methods Badges */}
                          <div className="pt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                            <span className="font-medium text-gray-400">Accepted:</span>
                            <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">UPI (GPay / PhonePe / Paytm / BHIM)</span>
                            <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">Visa / Mastercard / RuPay</span>
                            <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">Net Banking</span>
                            <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">Wallets</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Stock notices if any */}
                    {stockNotice.length > 0 && (
                      <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3">
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

                    {/* Error display */}
                    {placeError && (
                      <p className="text-red-500 text-sm text-center bg-red-50 dark:bg-red-950/40 rounded-xl py-3 px-4 border border-red-200 dark:border-red-800">{placeError}</p>
                    )}

                    {/* Bottom secondary links and FAQ */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-gray-500 dark:text-gray-400">
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="text-[#0A1F44] dark:text-blue-400 hover:underline font-medium"
                      >
                        ← Back to Payment Methods
                      </button>

                      <p className="text-center sm:text-right">
                        Questions about{" "}
                        <Link href="/faqs#shipping-delivery" className="text-[#0A1F44] dark:text-gray-300 font-semibold hover:underline">
                          shipping
                        </Link>{" "}
                        or{" "}
                        <Link href="/faqs#returns-exchanges" className="text-[#0A1F44] dark:text-gray-300 font-semibold hover:underline">
                          returns
                        </Link>
                        ? See our FAQs.
                      </p>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>

            {/* ── Price sidebar ── */}
            <div className={`lg:col-span-1 min-w-0 ${step === 4 ? "order-last" : "order-first lg:order-last"}`}>
              {/* Mobile Collapsible Summary for Steps 1-3 */}
              {step !== 4 && (
                <details className="lg:hidden group bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C7CCD1]/20 mb-4 overflow-hidden">
                  <summary className="flex items-center justify-between p-4 cursor-pointer list-none select-none hover:bg-gray-50/50 dark:hover:bg-[#1E2329]/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-sm font-bold text-[#0A1F44] dark:text-[#E5E8EC]">Order Total</span>
                      <span className="text-[11px] bg-[#0A1F44]/5 dark:bg-white/10 text-[#0A1F44] dark:text-[#E5E8EC] px-2 py-0.5 rounded-full font-medium">
                        {totalQuantity} {totalQuantity === 1 ? "Item" : "Items"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-[#0A1F44] dark:text-[#E5E8EC] text-base">₹{total.toLocaleString("en-IN")}</span>
                      <span className="text-xs text-[#0A1F44] dark:text-[#C7CCD1] font-medium group-open:hidden">Details ▼</span>
                      <span className="text-xs text-[#0A1F44] dark:text-[#C7CCD1] font-medium hidden group-open:inline">Hide ▲</span>
                    </div>
                  </summary>
                  <div className="px-4 pb-4 pt-1 border-t border-[#C7CCD1]/10 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="opacity-60">Total MRP</span>
                      <span>₹{totalMRP.toLocaleString("en-IN")}</span>
                    </div>
                    {mrpDiscount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Discount on MRP</span>
                        <span>− ₹{mrpDiscount.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {couponDiscount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Coupon Discount</span>
                        <span>− ₹{couponDiscount.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="opacity-60">Platform Fee</span>
                      <span>₹{platformFee}</span>
                    </div>
                    {paymentMethod === "cod" && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Cash/Pay on Delivery Fee</span>
                        <span>₹{codFee}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="opacity-60">Shipping</span>
                      <span className="text-green-600 font-semibold">FREE</span>
                    </div>
                    <div className="border-t border-[#C7CCD1]/20 pt-2 flex justify-between font-bold text-[#0A1F44] dark:text-[#E5E8EC] text-sm">
                      <span>Total Amount</span>
                      <span>₹{total.toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                </details>
              )}

              {/* Sticky Order Summary Card (On desktop for all steps, plus shown on mobile for Step 4) */}
              <div className={`${step === 4 ? "block" : "hidden lg:block"} bg-white dark:bg-[#2A2E35] rounded-2xl border border-[#C7CCD1]/30 dark:border-gray-700/60 p-5 sm:p-6 lg:sticky lg:top-24 shadow-sm space-y-4`}>
                <div className="flex items-center justify-between pb-3 border-b border-[#C7CCD1]/20 dark:border-gray-700/40">
                  <h2 className="font-serif text-lg font-bold text-[#0A1F44] dark:text-[#E5E8EC]">
                    PRICE DETAILS ({totalQuantity} {totalQuantity === 1 ? "Item" : "Items"})
                  </h2>
                  <span className="text-xs bg-[#0B2044]/10 text-[#0B2044] dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
                    {totalQuantity} {totalQuantity === 1 ? "Item" : "Items"}
                  </span>
                </div>

                {/* Coupon input & applied state */}
                <div className="pb-3 border-b border-[#C7CCD1]/20 dark:border-gray-700/40">
                  {appliedCoupon ? (
                    <div className="space-y-2">
                      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${couponOrderError ? "bg-red-50 border border-red-200" : "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800"}`}>
                        {couponOrderError ? (
                          <XCircle size={14} className="text-red-500 shrink-0" />
                        ) : (
                          <Check size={14} className="text-emerald-600 shrink-0" />
                        )}
                        <span className={`text-xs font-semibold flex-1 ${couponOrderError ? "text-red-700" : "text-emerald-700 dark:text-emerald-300"}`}>
                          {appliedCoupon.code} applied — {appliedCoupon.offerDisplayText || appliedCoupon.description}
                        </span>
                        <button
                          type="button"
                          onClick={() => { setAppliedCoupon(null); setCouponOrderError(""); }}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                          title="Remove coupon"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      {couponExpiringSoon && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <AlertTriangle size={12} /> Expires in {couponDaysLeft} day{couponDaysLeft !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Tag size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            value={couponCode}
                            onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                            onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                            placeholder="Enter coupon code"
                            className="w-full pl-8 pr-2 py-1.5 text-xs uppercase border border-[#C7CCD1]/40 rounded-lg bg-[#FAF7F2] dark:bg-[#1E2329] focus:outline-none focus:ring-2 focus:ring-[#0B2044]/30 font-medium"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => applyCoupon()}
                          disabled={couponLoading || !couponCode.trim()}
                          className="px-3 py-1.5 bg-[#0B2044] hover:bg-[#133060] disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors shrink-0"
                        >
                          {couponLoading ? "..." : "Apply"}
                        </button>
                      </div>
                      {couponError && <p className="text-red-500 text-[11px] mt-1">{couponError}</p>}
                      <div className="flex items-center justify-between mt-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            fetchAvailableCoupons();
                            setShowCouponModal(true);
                          }}
                          className="text-xs font-semibold text-[#0B2044] dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <Tag size={12} /> View Available Offers
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Price Breakdown Details */}
                <div className="space-y-2.5 text-xs sm:text-sm">
                  {totalMRP > totalSellingPrice && (
                    <>
                      <div className="flex justify-between text-gray-500 dark:text-gray-400">
                        <span>Total MRP</span>
                        <span className="line-through">₹{totalMRP.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                        <span>Discount on MRP</span>
                        <span>− ₹{mrpDiscount.toLocaleString("en-IN")}</span>
                      </div>
                    </>
                  )}

                  <div className="flex justify-between text-gray-600 dark:text-gray-300">
                    <span>Product Price</span>
                    <span className="font-medium text-gray-900 dark:text-white">₹{totalSellingPrice.toLocaleString("en-IN")}</span>
                  </div>

                  {couponDiscount > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                      <span>Coupon Discount</span>
                      <span>− ₹{couponDiscount.toLocaleString("en-IN")}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-gray-600 dark:text-gray-300">
                    <span>Platform Fee</span>
                    <span>₹{platformFee}</span>
                  </div>

                  {paymentMethod === "cod" && (
                    <div className="flex justify-between text-amber-700 dark:text-amber-400 font-medium">
                      <span>Cash/Pay on Delivery Fee</span>
                      <span>₹{codFee}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-gray-600 dark:text-gray-300 items-center">
                    <span>Shipping Charges</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded text-xs">
                      FREE
                    </span>
                  </div>
                </div>

                {/* Final Payable Total */}
                <div className="border-t border-[#C7CCD1]/30 dark:border-gray-700/60 pt-3">
                  <div className="flex justify-between items-baseline">
                    <span className="font-serif text-base sm:text-lg font-bold text-[#0A1F44] dark:text-[#E5E8EC]">Total Amount</span>
                    <span className="font-serif text-xl sm:text-2xl font-bold text-[#0A1F44] dark:text-white">
                      ₹{total.toLocaleString("en-IN")}
                    </span>
                  </div>

                  {(mrpDiscount > 0 || couponDiscount > 0) && (
                    <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold text-center bg-emerald-50 dark:bg-emerald-950/40 py-1 px-2 rounded-md border border-emerald-200 dark:border-emerald-800/40">
                      🎉 You save ₹{(mrpDiscount + couponDiscount).toLocaleString("en-IN")} on this order!
                    </p>
                  )}
                </div>

                {/* Trust Badges */}
                <div className="pt-3 border-t border-[#C7CCD1]/20 dark:border-gray-700/40 space-y-2 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
                    <span>100% Secure & Encrypted Payments</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Truck size={15} className="text-[#0A1F44] dark:text-blue-300 shrink-0" />
                    <span>Free Pan-India Insured Delivery</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle size={15} className="text-[#D4AF37] shrink-0" />
                    <span>7-Day Easy Returns & Exchanges</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <UpiWaitingModal
        isOpen={upiModalOpen}
        orderId={upiModalData?.orderId || ""}
        upiId={upiModalData?.upiId || upiId}
        amount={upiModalData?.total || total}
        timeRemaining={upiModalTimeRemaining}
        status={upiModalStatus}
        errorMsg={upiModalError}
        isSandbox={upiModalData?.isSandbox ?? true}
        onCheckStatus={() => {
          if (upiModalData?.orderId) {
            checkUpiPaymentStatus(upiModalData.orderId, true);
          }
        }}
        onSimulateApproval={simulateUpiPayment}
        onOpenSdkCheckout={openCashfreeSdkCheckout}
        onClose={() => {
          stopUpiPolling();
          setUpiModalOpen(false);
          setPlacing(false);
        }}
        onRetry={() => {
          stopUpiPolling();
          setUpiModalOpen(false);
          setPlacing(false);
          placeOrder();
        }}
        onSwitchToCod={() => {
          stopUpiPolling();
          setUpiModalOpen(false);
          setPaymentMethod("cod");
          setPlacing(false);
          setStep(4);
        }}
      />

      {showCouponModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <Tag size={16} className="text-[#0B2044]" />
                <h3 className="font-serif font-bold text-lg text-[#0B2044]">Available Offers & Coupons</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCouponModal(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 bg-[#F5F6F8]">
              {loadingCoupons ? (
                <div className="py-12 text-center text-gray-400 text-sm">Loading offers…</div>
              ) : availableCouponsList.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">No coupons available right now.</div>
              ) : (
                availableCouponsList.map((c, i) => (
                  <VastraaCouponCard
                    key={c.id || c.code}
                    coupon={c}
                    cartSubtotal={totalSellingPrice}
                    delay={i * 0.04}
                    onApply={(code) => applyCoupon(code)}
                    isApplied={appliedCoupon?.code === c.code}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
