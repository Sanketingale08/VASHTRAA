import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  CreditCard,
  Smartphone,
  Building2,
  Wallet as WalletIcon,
  HandCoins,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export type Order = {
  id: string;
  displayId?: string | null;
  userId: string;
  total: number;
  paymentMethod: string;
  paymentStatus?: string;
  status: string;
  address?: any;
  codFee?: number;
};

interface OrderPaymentModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: (updatedOrder: any) => void;
}

type PaymentTab = "upi" | "card" | "net_banking" | "wallet" | "cod";

const BANK_LIST = [
  { id: "hdfc", name: "HDFC Bank", logo: "🏦" },
  { id: "icici", name: "ICICI Bank", logo: "🏦" },
  { id: "sbi", name: "State Bank of India", logo: "🏦" },
  { id: "axis", name: "Axis Bank", logo: "🏦" },
  { id: "kotak", name: "Kotak Mahindra Bank", logo: "🏦" },
  { id: "pnb", name: "Punjab National Bank", logo: "🏦" },
];

const WALLET_LIST = [
  { id: "paytm", name: "Paytm Wallet", icon: "👛" },
  { id: "phonepe", name: "PhonePe Wallet", icon: "👛" },
  { id: "amazon_pay", name: "Amazon Pay", icon: "👛" },
  { id: "mobikwik", name: "MobiKwik", icon: "👛" },
];

export function OrderPaymentModal({
  order,
  isOpen,
  onClose,
  onPaymentSuccess,
}: OrderPaymentModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<PaymentTab>("upi");
  const [upiId, setUpiId] = useState("");
  const [upiLoading, setUpiLoading] = useState(false);
  const [upiWaiting, setUpiWaiting] = useState(false);
  const [countdown, setCountdown] = useState(600); // 10 minutes
  const [generalLoading, setGeneralLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMsg("");
      setUpiWaiting(false);
      setUpiLoading(false);
      setGeneralLoading(false);
      setCountdown(600);
      setActiveTab("upi");
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen]);

  // Countdown for UPI collect
  useEffect(() => {
    if (!upiWaiting) return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          setUpiWaiting(false);
          setErrorMsg("UPI collect request timed out. Please retry or choose another payment method.");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [upiWaiting]);

  // Poll verification endpoint while waiting for UPI collect approval
  const startUpiPolling = (orderId: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      try {
        const verifyRes = await apiFetch(`/api/payments/cashfree/verify-order/${orderId}`);
        const data = await verifyRes.json();
        if (data.paid || data.paymentStatus === "paid") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setUpiWaiting(false);
          toast({
            title: "Payment Successful",
            description: "Your payment has been verified successfully.",
          });
          onPaymentSuccess(data);
          onClose();
        } else if (data.paymentStatus === "failed") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setUpiWaiting(false);
          setErrorMsg(data.message || "Payment attempt failed or was cancelled in your UPI app.");
        }
      } catch (e: any) {
        // Continue polling
      }
    }, 3000);
  };

  // Helper to open Cashfree Drop-in SDK checkout
  const triggerCashfreeSdkCheckout = async (paymentMethod: string) => {
    setErrorMsg("");
    setGeneralLoading(true);
    try {
      // 1. Get or create payment session from server
      const res = await apiFetch(`/api/orders/${order.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to initialize payment gateway session");
      }

      const data = await res.json();
      if (data.alreadyPaid) {
        toast({ title: "Order Already Paid", description: "This order is already marked as paid." });
        onPaymentSuccess({ paymentStatus: "paid" });
        onClose();
        return;
      }

      // 2. Open Cashfree checkout modal
      const cashfreeLib = (window as any).Cashfree;
      if (!cashfreeLib) {
        throw new Error("Cashfree payment gateway SDK is loading. Please try again in a few moments.");
      }

      const cashfree = cashfreeLib({
        mode: data.env === "production" ? "production" : "sandbox",
      });

      await cashfree.checkout({
        paymentSessionId: data.paymentSessionId,
        redirectTarget: "_modal",
      });

      // 3. Verify payment after SDK modal closes
      const verifyRes = await apiFetch(`/api/payments/cashfree/verify-order/${order.id}`);
      const verifyData = await verifyRes.json().catch(() => ({}));

      if (verifyRes.ok && (verifyData.paid || verifyData.paymentStatus === "paid")) {
        toast({
          title: "Payment Successful",
          description: "Your payment has been verified. Order is now confirmed!",
        });
        onPaymentSuccess(verifyData);
        onClose();
      } else {
        // Payment was not completed or closed by user
        setErrorMsg("Payment was not completed or is still pending. You can retry anytime.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Payment initiation failed. Please try again.");
    } finally {
      setGeneralLoading(false);
    }
  };

  // Handle direct UPI collect with custom VPA
  const handleUpiCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanVpa = upiId.trim();
    if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(cleanVpa)) {
      setErrorMsg("Please enter a valid UPI ID (e.g. yourname@okhdfcbank or mobilenumber@paytm)");
      return;
    }

    setErrorMsg("");
    setUpiLoading(true);

    try {
      const res = await apiFetch(`/api/orders/${order.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: "upi", upiId: cleanVpa }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send UPI collect request");
      }

      if (data.upiResponse?.action === "sdk_fallback") {
        // If collect is not allowed on merchant, fallback to Cashfree SDK modal
        toast({
          title: "Opening UPI Apps",
          description: "Proceeding with standard UPI gateway checkout.",
        });
        await triggerCashfreeSdkCheckout("upi");
        return;
      }

      setUpiWaiting(true);
      startUpiPolling(order.id);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to initiate UPI collect request. Please try an alternative method.");
    } finally {
      setUpiLoading(false);
    }
  };

  // Handle switching order to Cash on Delivery (Pay on Delivery)
  const handleSwitchToCod = async () => {
    setErrorMsg("");
    setGeneralLoading(true);

    try {
      const res = await apiFetch(`/api/orders/${order.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: "cod" }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to switch to Cash on Delivery");
      }

      toast({
        title: "Pay on Delivery Selected",
        description: "Your order has been updated to Pay on Delivery. Amount will be collected upon delivery.",
      });

      onPaymentSuccess({
        paymentMethod: "cod",
        paymentStatus: "pending",
        codFee: data.codFee,
        total: data.total,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Could not switch to Cash on Delivery. Please try again.");
    } finally {
      setGeneralLoading(false);
    }
  };

  if (!isOpen) return null;

  const isCodEligible = order.total <= 50000 && order.status !== "cancelled";
  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const timeFormatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-[#1E2329] w-full max-w-xl rounded-2xl shadow-2xl border border-[#C7CCD1]/30 overflow-hidden flex flex-col max-h-[90vh] max-h-screen-dynamic"
        >
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-[#0A1F44] to-[#152e5d] text-white flex items-center justify-between shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-amber-300 font-semibold">Complete Payment</span>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-mono">
                  #{order.displayId || order.id}
                </span>
              </div>
              <h2 className="text-xl font-serif font-bold mt-1">Select Payment Method</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[11px] text-gray-300">Amount to Pay</p>
                <p className="text-xl font-bold text-amber-300">₹{order.total.toLocaleString("en-IN")}</p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto scroll-touch scrollbar-thin p-5 space-y-5">
            {/* Payment Method Selector Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => { setActiveTab("upi"); setUpiWaiting(false); setErrorMsg(""); }}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 text-center transition-all ${
                  activeTab === "upi"
                    ? "border-[#0A1F44] bg-[#0A1F44]/5 text-[#0A1F44] dark:bg-white/10 dark:text-white font-bold ring-1 ring-[#0A1F44]"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <Smartphone size={20} className={activeTab === "upi" ? "text-[#0A1F44] dark:text-amber-400" : "text-gray-500"} />
                <span className="text-xs">UPI</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab("card"); setUpiWaiting(false); setErrorMsg(""); }}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 text-center transition-all ${
                  activeTab === "card"
                    ? "border-[#0A1F44] bg-[#0A1F44]/5 text-[#0A1F44] dark:bg-white/10 dark:text-white font-bold ring-1 ring-[#0A1F44]"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <CreditCard size={20} className={activeTab === "card" ? "text-[#0A1F44] dark:text-amber-400" : "text-gray-500"} />
                <span className="text-xs">Cards</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab("net_banking"); setUpiWaiting(false); setErrorMsg(""); }}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 text-center transition-all ${
                  activeTab === "net_banking"
                    ? "border-[#0A1F44] bg-[#0A1F44]/5 text-[#0A1F44] dark:bg-white/10 dark:text-white font-bold ring-1 ring-[#0A1F44]"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <Building2 size={20} className={activeTab === "net_banking" ? "text-[#0A1F44] dark:text-amber-400" : "text-gray-500"} />
                <span className="text-xs">Net Banking</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab("wallet"); setUpiWaiting(false); setErrorMsg(""); }}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 text-center transition-all ${
                  activeTab === "wallet"
                    ? "border-[#0A1F44] bg-[#0A1F44]/5 text-[#0A1F44] dark:bg-white/10 dark:text-white font-bold ring-1 ring-[#0A1F44]"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <WalletIcon size={20} className={activeTab === "wallet" ? "text-[#0A1F44] dark:text-amber-400" : "text-gray-500"} />
                <span className="text-xs">Wallets</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab("cod"); setUpiWaiting(false); setErrorMsg(""); }}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 text-center transition-all col-span-2 sm:col-span-1 ${
                  activeTab === "cod"
                    ? "border-amber-600 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 font-bold ring-1 ring-amber-600"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <HandCoins size={20} className={activeTab === "cod" ? "text-amber-600" : "text-gray-500"} />
                <span className="text-xs">Pay on Delivery</span>
              </button>
            </div>

            {/* TAB 1: UPI */}
            {activeTab === "upi" && (
              <div className="space-y-4">
                {upiWaiting ? (
                  <div className="p-6 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-900/40 text-center space-y-3">
                    <Loader2 size={36} className="animate-spin text-blue-600 mx-auto" />
                    <div>
                      <h4 className="font-bold text-blue-900 dark:text-blue-100 text-base">Approve Payment on Your UPI App</h4>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        Collect request sent to <span className="font-semibold">{upiId}</span>. Please open your UPI app (Google Pay, PhonePe, Paytm, BHIM) and approve the ₹{order.total} request.
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-1.5 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-xs font-mono font-bold">
                      <Clock size={12} /> Time remaining: {timeFormatted}
                    </div>
                    <div className="pt-2 flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => triggerCashfreeSdkCheckout("upi")}
                        className="text-xs text-blue-800 dark:text-blue-200 hover:underline font-semibold"
                      >
                        Open Cashfree QR / Modal Instead
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                          setUpiWaiting(false);
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Quick UPI App Launch */}
                    <div>
                      <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                        Supported UPI Apps
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { name: "Google Pay", sub: "GPay", color: "bg-blue-50 text-blue-700 border-blue-200" },
                          { name: "PhonePe", sub: "PhonePe", color: "bg-purple-50 text-purple-700 border-purple-200" },
                          { name: "Paytm", sub: "Paytm UPI", color: "bg-sky-50 text-sky-700 border-sky-200" },
                          { name: "BHIM UPI", sub: "BHIM", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                        ].map((app) => (
                          <button
                            key={app.name}
                            type="button"
                            disabled={generalLoading}
                            onClick={() => triggerCashfreeSdkCheckout("upi")}
                            className={`p-3 rounded-xl border text-center font-semibold text-xs hover:shadow-sm transition-all flex flex-col items-center justify-center gap-1 ${app.color}`}
                          >
                            <span>{app.name}</span>
                            <span className="text-[10px] opacity-70">Pay via App</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="relative my-3 flex items-center justify-center">
                      <div className="border-t border-gray-200 dark:border-gray-700 w-full" />
                      <span className="bg-white dark:bg-[#1E2329] px-3 text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
                        Or enter UPI ID
                      </span>
                    </div>

                    {/* Custom UPI ID Collect Form */}
                    <form onSubmit={handleUpiCollect} className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Virtual Payment Address (VPA)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="e.g. 9876543210@paytm or user@okhdfcbank"
                            value={upiId}
                            onChange={(e) => setUpiId(e.target.value)}
                            className="flex-1 px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44]"
                          />
                          <button
                            type="submit"
                            disabled={upiLoading || !upiId.trim()}
                            className="bg-[#0A1F44] hover:bg-[#18366d] text-white px-5 py-2.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {upiLoading ? <Loader2 size={14} className="animate-spin" /> : "Verify & Pay"}
                          </button>
                        </div>
                      </div>
                    </form>

                    <button
                      type="button"
                      disabled={generalLoading}
                      onClick={() => triggerCashfreeSdkCheckout("upi")}
                      className="w-full mt-2 py-3 bg-[#0A1F44] hover:bg-[#18366d] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {generalLoading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> Connecting to Gateway…
                        </>
                      ) : (
                        <>
                          <Smartphone size={16} /> Pay ₹{order.total.toLocaleString("en-IN")} with UPI QR / Apps
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* TAB 2: CREDIT / DEBIT CARDS */}
            {activeTab === "card" && (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Accepted Cards</span>
                    <span className="text-[11px] text-gray-400">100% RBI Compliant Tokenization</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-medium">
                    {["Visa", "Mastercard", "RuPay", "Maestro", "American Express"].map((brand) => (
                      <span key={brand} className="bg-white dark:bg-gray-700 px-3 py-1 rounded-md border border-gray-200 dark:border-gray-600">
                        💳 {brand}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    Pay securely using any Indian or International credit or debit card. Protected by 256-bit SSL encryption.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={generalLoading}
                  onClick={() => triggerCashfreeSdkCheckout("card")}
                  className="w-full py-3.5 bg-[#0A1F44] hover:bg-[#18366d] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {generalLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Opening Secure Card Gateway…
                    </>
                  ) : (
                    <>
                      <CreditCard size={16} /> Pay ₹{order.total.toLocaleString("en-IN")} via Card
                    </>
                  )}
                </button>
              </div>
            )}

            {/* TAB 3: NET BANKING */}
            {activeTab === "net_banking" && (
              <div className="space-y-4">
                <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Popular Indian Banks
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BANK_LIST.map((bank) => (
                    <button
                      key={bank.id}
                      type="button"
                      disabled={generalLoading}
                      onClick={() => triggerCashfreeSdkCheckout("net_banking")}
                      className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-[#0A1F44] hover:bg-[#0A1F44]/5 text-left transition-all flex items-center gap-2"
                    >
                      <span className="text-lg">{bank.logo}</span>
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{bank.name}</span>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={generalLoading}
                  onClick={() => triggerCashfreeSdkCheckout("net_banking")}
                  className="w-full py-3.5 bg-[#0A1F44] hover:bg-[#18366d] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {generalLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Connecting to Bank Portal…
                    </>
                  ) : (
                    <>
                      <Building2 size={16} /> Select Bank &amp; Pay ₹{order.total.toLocaleString("en-IN")}
                    </>
                  )}
                </button>
              </div>
            )}

            {/* TAB 4: WALLETS */}
            {activeTab === "wallet" && (
              <div className="space-y-4">
                <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Supported Digital Wallets
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {WALLET_LIST.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      disabled={generalLoading}
                      onClick={() => triggerCashfreeSdkCheckout("wallet")}
                      className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-[#0A1F44] hover:bg-[#0A1F44]/5 text-left transition-all flex items-center gap-2.5"
                    >
                      <span className="text-xl">{w.icon}</span>
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{w.name}</span>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={generalLoading}
                  onClick={() => triggerCashfreeSdkCheckout("wallet")}
                  className="w-full py-3.5 bg-[#0A1F44] hover:bg-[#18366d] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {generalLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Connecting to Wallet…
                    </>
                  ) : (
                    <>
                      <WalletIcon size={16} /> Pay ₹{order.total.toLocaleString("en-IN")} via Wallet
                    </>
                  )}
                </button>
              </div>
            )}

            {/* TAB 5: CASH ON DELIVERY (PAY ON DELIVERY) */}
            {activeTab === "cod" && (
              <div className="space-y-4">
                {isCodEligible ? (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200/60 dark:border-amber-900/40 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <HandCoins className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" size={20} />
                      <div>
                        <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                          Pay on Delivery (Cash on Delivery)
                        </h4>
                        <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                          No advance online payment required. Pay the total amount due when the delivery partner hands over your package.
                        </p>
                      </div>
                    </div>

                    <div className="bg-white/80 dark:bg-gray-800/80 p-3 rounded-lg border border-amber-200/40 text-xs space-y-1.5 font-medium">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Order Subtotal</span>
                        <span>₹{order.total.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="flex justify-between text-amber-800 dark:text-amber-300">
                        <span>Pay on Delivery Handling Fee</span>
                        <span>₹10</span>
                      </div>
                      <div className="flex justify-between font-bold text-[#0A1F44] dark:text-white pt-1 border-t border-gray-200 dark:border-gray-700">
                        <span>Total Payable on Delivery</span>
                        <span>
                          ₹{(order.paymentMethod === "cod" ? order.total : order.total + 10).toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-gray-500">
                      Payment can be made in cash or via UPI QR code on the delivery agent's handheld device at the time of delivery.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 text-red-700 text-xs">
                    This order is not eligible for Cash on Delivery (maximum limit is ₹50,000 or order has been cancelled).
                  </div>
                )}

                {isCodEligible && (
                  <button
                    type="button"
                    disabled={generalLoading}
                    onClick={handleSwitchToCod}
                    className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {generalLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Updating Order…
                      </>
                    ) : (
                      <>
                        <HandCoins size={16} /> Confirm Pay on Delivery (₹{(order.paymentMethod === "cod" ? order.total : order.total + 10).toLocaleString("en-IN")})
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer Security Badges */}
          <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-[11px] text-gray-500 shrink-0">
            <span className="flex items-center gap-1">
              <ShieldCheck size={14} className="text-emerald-600" /> 100% Safe &amp; Secure Checkout
            </span>
            <span>Powered by Cashfree Payments</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
