import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PaymentMethod as SharedPaymentMethod } from "@workspace/api-zod";

import { useCart, CartItem } from "@/context/CartContext";
import { useColors } from "@/hooks/useColors";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

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

type DeliveryMethod = "standard" | "express";
type PaymentMethod = Extract<SharedPaymentMethod, "upi" | "card" | "cod">;

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

function PriceRow({ label, value, highlight, green }: { label: string; value: string; highlight?: boolean; green?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ fontFamily: highlight ? "DMSans_700Bold" : "DMSans_400Regular", fontSize: 13, color: highlight ? colors.primary : colors.mutedForeground }}>
        {label}
      </Text>
      <Text style={{ fontFamily: highlight ? "DMSans_700Bold" : "DMSans_500Medium", fontSize: 13, color: green ? "#22A66A" : highlight ? colors.primary : colors.foreground }}>
        {value}
      </Text>
    </View>
  );
}

export default function CheckoutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { items: cartItems, clearCart } = useCart();
  const params = useLocalSearchParams<{ buyNow?: string }>();

  const [step, setStep] = useState(1);
  const [buyNowItem, setBuyNowItem] = useState<CartItem | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");

  const [address, setAddress] = useState<Address>({
    name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "",
  });
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [enteringNew, setEnteringNew] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [addressesError, setAddressesError] = useState(false);
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const [addressSaveError, setAddressSaveError] = useState("");

  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("standard");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [upiId, setUpiId] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardName, setCardName] = useState("");
  const [savePaymentMethod, setSavePaymentMethod] = useState(false);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<any[]>([]);
  const [selectedSavedPaymentId, setSelectedSavedPaymentId] = useState<string | null>(null);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(true);
  const [enteringNewPayment, setEnteringNewPayment] = useState(false);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<null | {
    code: string; type: "percent" | "flat"; value: number; expiresAt: string | null;
  }>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponOrderError, setCouponOrderError] = useState("");

  useEffect(() => {
    if (params.buyNow) {
      try {
        const item = JSON.parse(decodeURIComponent(params.buyNow));
        setBuyNowItem(item);
      } catch {}
    }
  }, [params.buyNow]);

  const fetchAddresses = React.useCallback(() => {
    if (!isLoaded || !isSignedIn) return;
    setAddressesLoading(true);
    setAddressesError(false);
    getToken()
      .then((token) => {
        if (!token) throw new Error("No auth token");
        return fetch(`${API_BASE}/api/addresses`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch addresses");
        return r.json();
      })
      .then((data) => {
        const addrs = data.addresses ?? [];
        setSavedAddresses(addrs);
        const def = addrs.find((a: any) => a.isDefault) ?? addrs[0];
        if (def) {
          setSelectedSavedId(def.id);
          setAddress({ name: def.name, phone: def.phone, line1: def.line1, line2: def.line2 ?? "", city: def.city, state: def.state, pincode: def.pincode });
        } else {
          setEnteringNew(true);
        }
        setAddressesLoaded(true);
      })
      .catch(() => {
        setAddressesError(true);
      })
      .finally(() => setAddressesLoading(false));
  }, [isLoaded, isSignedIn]);

  const fetchPaymentMethods = React.useCallback(() => {
    if (!isLoaded || !isSignedIn) return;
    setPaymentMethodsLoading(true);
    getToken()
      .then((token) => {
        if (!token) throw new Error("No auth token");
        return fetch(`${API_BASE}/api/payment-methods`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch payment methods");
        return r.json();
      })
      .then((data) => {
        const methods = data.paymentMethods ?? [];
        setSavedPaymentMethods(methods);
        const def = methods.find((m: any) => m.isDefault) ?? methods[0];
        if (def) {
          setSelectedSavedPaymentId(def.id);
          setEnteringNewPayment(false);
        } else {
          setEnteringNewPayment(true);
        }
      })
      .catch(() => {
        // Non-fatal — user can still enter payment details manually
        setEnteringNewPayment(true);
      })
      .finally(() => setPaymentMethodsLoading(false));
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    fetchAddresses();
    fetchPaymentMethods();
  }, [fetchAddresses, fetchPaymentMethods]);

  const orderItems = buyNowItem ? [buyNowItem] : cartItems;
  const totalMRP = orderItems.reduce((s, i: any) => s + Math.max(i.originalPrice ?? 0, i.price) * i.quantity, 0);
  const totalSellingPrice = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const mrpDiscount = Math.max(0, totalMRP - totalSellingPrice);
  const subtotal = totalSellingPrice;
  const couponHoursLeft = appliedCoupon?.expiresAt
    ? (new Date(appliedCoupon.expiresAt).getTime() - Date.now()) / 3600000
    : null;
  const couponExpiringSoon = couponHoursLeft !== null && couponHoursLeft > 0 && couponHoursLeft <= 72;
  const couponDaysLeft = couponExpiringSoon ? Math.max(1, Math.ceil((couponHoursLeft as number) / 24)) : null;
  let discount = 0;
  if (appliedCoupon) {
    discount = appliedCoupon.type === "percent"
      ? Math.round(totalSellingPrice * appliedCoupon.value / 100)
      : Math.min(appliedCoupon.value, totalSellingPrice);
  }
  const afterDiscount = totalSellingPrice - discount;
  const platformFee = 20;
  const codFee = paymentMethod === "cod" ? 10 : 0;
  const shippingCost = 0;
  const gst = 0;
  const total = totalSellingPrice - discount + platformFee + codFee;

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

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/coupons/validate?code=${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCouponError((err as any).error || "Invalid coupon code");
        return;
      }
      const data = await res.json();
      setAppliedCoupon({ code: data.code, type: data.type, value: data.value, expiresAt: data.expiresAt ?? null });
      setCouponCode("");
    } catch {
      setCouponError("Could not validate coupon.");
    } finally {
      setCouponLoading(false);
    }
  }

  async function placeOrder() {
    setPlacing(true);
    setPlaceError("");
    setCouponOrderError("");
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
          paymentMethod,
          couponCode: appliedCoupon?.code ?? null,
          subtotal,
          discount,
          shipping: shippingCost,
          tax: gst,
          total,
          isBuyNow: !!buyNowItem,
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

      // Save payment method in the background if requested
      if (savePaymentMethod && enteringNewPayment && (paymentMethod === "card" || paymentMethod === "upi")) {
        try {
          let body: Record<string, any>;
          if (paymentMethod === "card") {
            const [expMonth, expYear] = cardExpiry.split("/").map((p) => parseInt(p.trim(), 10));
            body = {
              type: "card",
              cardNumber: cardNumber.replace(/\D/g, ""),
              cardholderName: cardName.trim(),
              expiryMonth: expMonth,
              expiryYear: expYear < 100 ? 2000 + expYear : expYear,
              cvv: cardCvv,
            };
          } else {
            body = { type: "upi", upiId: upiId.trim() };
          }
          await fetch(`${API_BASE}/api/payment-methods`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          });
        } catch {
          // Non-fatal — order was placed successfully
        }
      }

      if (!buyNowItem) await clearCart();
      router.replace(`/orders/${data.orderId}` as any);
    } catch (err: any) {
      setPlaceError(err.message || "Failed to place order. Please try again.");
    } finally {
      setPlacing(false);
    }
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: Platform.OS === "web" ? 20 : insets.top + 8,
      paddingBottom: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + "22",
      backgroundColor: colors.background,
    },
    backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginRight: 8 },
    headerTitle: { fontFamily: "CormorantGaramond_700Bold", fontSize: 22, color: colors.foreground, flex: 1 },
    stepBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: colors.card,
    },
    stepDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    stepLabel: {
      fontFamily: "DMSans_500Medium",
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginTop: 2,
      textAlign: "center",
    },
    stepLine: { flex: 1, height: 1, marginHorizontal: 4 },
    content: { paddingHorizontal: 16, paddingTop: 16 },
    sectionTitle: {
      fontFamily: "CormorantGaramond_700Bold",
      fontSize: 22,
      color: colors.foreground,
      marginBottom: 16,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border + "22",
      padding: 14,
      marginBottom: 12,
    },
    label: {
      fontFamily: "DMSans_500Medium",
      fontSize: 12,
      color: colors.mutedForeground,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    inputBox: {
      backgroundColor: colors.input,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border + "44",
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.foreground,
      marginBottom: 10,
    },
    row2: { flexDirection: "row", gap: 10 },
    stateBtn: {
      flex: 1,
      backgroundColor: colors.input,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border + "44",
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    stateBtnText: { fontFamily: "DMSans_400Regular", fontSize: 14, color: colors.foreground },
    optionCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: colors.radius,
      borderWidth: 2,
      padding: 14,
      marginBottom: 10,
    },
    optionIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    optionTitle: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.foreground },
    optionSub: { fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 1 },
    optionPrice: { fontFamily: "DMSans_700Bold", fontSize: 13, marginLeft: "auto" as any },
    couponRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
    couponInput: {
      flex: 1,
      backgroundColor: colors.input,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border + "44",
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.foreground,
    },
    couponApplyBtn: {
      backgroundColor: colors.secondary,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    couponApplyText: { fontFamily: "DMSans_700Bold", fontSize: 13, color: colors.secondaryForeground },
    couponError: { fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.destructive, marginBottom: 8 },
    appliedCoupon: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#E8F5EE",
      borderRadius: colors.radius,
      padding: 10,
      gap: 8,
      marginBottom: 16,
    },
    appliedCouponText: { fontFamily: "DMSans_500Medium", fontSize: 13, color: "#22A66A", flex: 1 },
    divider: { height: 1, backgroundColor: colors.border + "33", marginVertical: 10 },
    ctaArea: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: Platform.OS === "web" ? 20 : insets.bottom + 16,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border + "22",
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 15,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryBtnText: {
      fontFamily: "DMSans_700Bold",
      fontSize: 15,
      color: colors.primaryForeground,
      letterSpacing: 0.5,
    },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: colors.border + "66",
      borderRadius: colors.radius,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    secondaryBtnText: {
      fontFamily: "DMSans_700Bold",
      fontSize: 14,
      color: colors.primary,
    },
    errorBox: {
      backgroundColor: colors.destructive + "15",
      borderRadius: colors.radius,
      padding: 12,
      marginBottom: 12,
    },
    errorBoxText: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      color: colors.destructive,
    },
    checkRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
      marginBottom: 10,
    },
    checkBox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    checkLabel: { fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.mutedForeground, flex: 1 },
  });

  if (!isLoaded) {
    return (
      <View style={[s.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <View style={[s.container, { alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }]}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.secondary} />
        <Text style={[s.sectionTitle, { textAlign: "center", marginTop: 16 }]}>Sign in to Checkout</Text>
        <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginBottom: 24 }}>
          You need to be signed in to place an order.
        </Text>
        <Pressable style={[s.primaryBtn, { width: "100%" }]} onPress={() => router.push("/(auth)/sign-in")}>
          <Text style={s.primaryBtnText}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  if (orderItems.length === 0) {
    return (
      <View style={[s.container, { alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }]}>
        <Ionicons name="bag-outline" size={48} color={colors.secondary} />
        <Text style={[s.sectionTitle, { textAlign: "center", marginTop: 16 }]}>Nothing to Checkout</Text>
        <Pressable style={[s.primaryBtn, { width: "100%", marginTop: 8 }]} onPress={() => router.replace("/(tabs)")}>
          <Text style={s.primaryBtnText}>Continue Shopping</Text>
        </Pressable>
      </View>
    );
  }

  const steps = ["Address", "Delivery", "Payment", "Review"];

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => (step > 1 ? setStep(step - 1) : router.back())} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={s.headerTitle}>Checkout</Text>
        {buyNowItem && (
          <View style={{ backgroundColor: colors.secondary, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 10, color: colors.secondaryForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>Buy Now</Text>
          </View>
        )}
      </View>

      <View style={s.stepBar}>
        {steps.map((label, i) => {
          const num = i + 1;
          const done = step > num;
          const current = step === num;
          return (
            <React.Fragment key={label}>
              <View style={{ alignItems: "center" }}>
                <Pressable
                  onPress={() => done ? setStep(num) : undefined}
                  style={[s.stepDot, {
                    backgroundColor: done ? "#22A66A" : current ? colors.primary : colors.muted,
                  }]}
                >
                  {done
                    ? <Ionicons name="checkmark" size={14} color="#fff" />
                    : <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 12, color: current ? colors.primaryForeground : colors.mutedForeground }}>{num}</Text>
                  }
                </Pressable>
                <Text style={[s.stepLabel, { color: current ? colors.primary : done ? "#22A66A" : colors.mutedForeground }]}>{label}</Text>
              </View>
              {i < steps.length - 1 && (
                <View style={[s.stepLine, { backgroundColor: step > num ? "#22A66A" : colors.border + "44" }]} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.content}>
            {addressSaveError ? (
              <View style={[s.errorBox, { flexDirection: "row", alignItems: "flex-start", gap: 8 }]}>
                <Ionicons name="warning-outline" size={16} color={colors.destructive} />
                <Text style={[s.errorBoxText, { flex: 1 }]}>{addressSaveError}</Text>
                <Pressable onPress={() => setAddressSaveError("")} hitSlop={8}>
                  <Ionicons name="close" size={16} color={colors.destructive} />
                </Pressable>
              </View>
            ) : null}
            {step === 1 && (
              <>
                <Text style={s.sectionTitle}>Shipping Address</Text>

                {addressesLoading && (
                  <View style={[s.card, { alignItems: "center", paddingVertical: 24 }]}>
                    <ActivityIndicator size="small" color={colors.secondary} />
                    <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.mutedForeground, marginTop: 10 }}>
                      Loading your saved addresses…
                    </Text>
                  </View>
                )}

                {!addressesLoading && addressesError && (
                  <View style={[s.card, { alignItems: "center", paddingVertical: 20 }]}>
                    <Ionicons name="cloud-offline-outline" size={28} color={colors.destructive} />
                    <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.foreground, marginTop: 10, textAlign: "center" }}>
                      Couldn't load your saved addresses.
                    </Text>
                    <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2, textAlign: "center" }}>
                      Check your connection and try again.
                    </Text>
                    <Pressable
                      testID="retry-load-addresses"
                      onPress={fetchAddresses}
                      style={[s.secondaryBtn, { marginTop: 14, marginBottom: 0, paddingHorizontal: 24, alignSelf: "center" }]}
                    >
                      <Text style={s.secondaryBtnText}>Retry</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { setAddressesError(false); setEnteringNew(true); }}
                      style={{ marginTop: 12 }}
                    >
                      <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 12, color: colors.secondary, textDecorationLine: "underline" }}>
                        Enter address manually instead
                      </Text>
                    </Pressable>
                  </View>
                )}

                {!addressesLoading && !addressesError && savedAddresses.length > 0 && !enteringNew && (
                  <>
                    <Text style={s.label}>Saved Addresses</Text>
                    {savedAddresses.map((sa: any) => (
                      <Pressable
                        key={sa.id}
                        onPress={() => {
                          setSelectedSavedId(sa.id);
                          setAddress({ name: sa.name, phone: sa.phone, line1: sa.line1, line2: sa.line2 ?? "", city: sa.city, state: sa.state, pincode: sa.pincode });
                        }}
                        style={[s.optionCard, {
                          borderColor: selectedSavedId === sa.id ? colors.primary : colors.border + "44",
                          backgroundColor: selectedSavedId === sa.id ? colors.primary + "08" : colors.card,
                        }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.foreground }}>{sa.name}</Text>
                          <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{sa.phone}</Text>
                          <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }} numberOfLines={2}>
                            {[sa.line1, sa.line2, sa.city, sa.state, sa.pincode].filter(Boolean).join(", ")}
                          </Text>
                          {sa.isDefault && (
                            <View style={{ backgroundColor: colors.secondary + "22", borderRadius: 3, alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 }}>
                              <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 10, color: colors.secondary }}>Default</Text>
                            </View>
                          )}
                        </View>
                        {selectedSavedId === sa.id && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => { setSelectedSavedId(null); setEnteringNew(true); setAddress({ name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" }); }}
                      style={[s.optionCard, { borderStyle: "dashed", borderColor: colors.border + "66", justifyContent: "center" }]}
                    >
                      <Ionicons name="add" size={18} color={colors.secondary} />
                      <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.secondary, marginLeft: 6 }}>Add a new address</Text>
                    </Pressable>
                  </>
                )}

                {!addressesLoading && !addressesError && (enteringNew || savedAddresses.length === 0) && (
                  <>
                    {savedAddresses.length > 0 && (
                      <Pressable onPress={() => setEnteringNew(false)} style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                        <Ionicons name="chevron-back" size={16} color={colors.secondary} />
                        <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.secondary }}>Back to saved addresses</Text>
                      </Pressable>
                    )}
                    <Text style={s.label}>Full Name *</Text>
                    <TextInput testID="checkout-name" style={s.inputBox} value={address.name} onChangeText={(v) => setAddress((a) => ({ ...a, name: v }))} onChange={(e: any) => { const v = e?.nativeEvent?.text ?? e?.target?.value ?? ""; if (v) setAddress((a) => ({ ...a, name: v })); }} placeholder="Priya Sharma" placeholderTextColor={colors.mutedForeground + "88"} />
                    <Text style={s.label}>Phone Number *</Text>
                    <TextInput testID="checkout-phone" style={s.inputBox} value={address.phone} onChangeText={(v) => setAddress((a) => ({ ...a, phone: v.replace(/\D/g, "").slice(0, 10) }))} onChange={(e: any) => { const v = (e?.nativeEvent?.text ?? e?.target?.value ?? "").replace(/\D/g, "").slice(0, 10); if (v) setAddress((a) => ({ ...a, phone: v })); }} placeholder="9876543210" placeholderTextColor={colors.mutedForeground + "88"} keyboardType="phone-pad" />
                    <Text style={s.label}>Address Line 1 *</Text>
                    <TextInput testID="checkout-line1" style={s.inputBox} value={address.line1} onChangeText={(v) => setAddress((a) => ({ ...a, line1: v }))} onChange={(e: any) => { const v = e?.nativeEvent?.text ?? e?.target?.value ?? ""; if (v) setAddress((a) => ({ ...a, line1: v })); }} placeholder="House / Flat / Block No., Street" placeholderTextColor={colors.mutedForeground + "88"} />
                    <Text style={s.label}>Address Line 2</Text>
                    <TextInput testID="checkout-line2" style={s.inputBox} value={address.line2} onChangeText={(v) => setAddress((a) => ({ ...a, line2: v }))} onChange={(e: any) => { const v = e?.nativeEvent?.text ?? e?.target?.value ?? ""; setAddress((a) => ({ ...a, line2: v })); }} placeholder="Area, Landmark (optional)" placeholderTextColor={colors.mutedForeground + "88"} />
                    <View style={s.row2}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.label}>City *</Text>
                        <TextInput testID="checkout-city" style={s.inputBox} value={address.city} onChangeText={(v) => setAddress((a) => ({ ...a, city: v }))} onChange={(e: any) => { const v = e?.nativeEvent?.text ?? e?.target?.value ?? ""; if (v) setAddress((a) => ({ ...a, city: v })); }} placeholder="Mumbai" placeholderTextColor={colors.mutedForeground + "88"} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.label}>Pincode *</Text>
                        <TextInput testID="checkout-pincode" style={s.inputBox} value={address.pincode} onChangeText={(v) => setAddress((a) => ({ ...a, pincode: v.replace(/\D/g, "").slice(0, 6) }))} onChange={(e: any) => { const v = (e?.nativeEvent?.text ?? e?.target?.value ?? "").replace(/\D/g, "").slice(0, 6); if (v) setAddress((a) => ({ ...a, pincode: v })); }} placeholder="400001" placeholderTextColor={colors.mutedForeground + "88"} />
                      </View>
                    </View>
                    <Text style={s.label}>State *</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {INDIAN_STATES.map((st) => (
                          <Pressable
                            key={st}
                            testID={`state-chip-${st.replace(/ /g, "-")}`}
                            onPress={() => setAddress((a) => ({ ...a, state: st }))}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 7,
                              borderRadius: 20,
                              borderWidth: 1,
                              borderColor: address.state === st ? colors.primary : colors.border + "44",
                              backgroundColor: address.state === st ? colors.primary + "10" : colors.card,
                            }}
                          >
                            <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: address.state === st ? colors.primary : colors.foreground }}>{st}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                    <Pressable onPress={() => setSaveAddress(!saveAddress)} style={s.checkRow}>
                      <View style={[s.checkBox, { borderColor: saveAddress ? colors.primary : colors.border, backgroundColor: saveAddress ? colors.primary : "transparent" }]}>
                        {saveAddress && <Ionicons name="checkmark" size={12} color={colors.primaryForeground} />}
                      </View>
                      <Text style={s.checkLabel}>Save this address for future orders</Text>
                    </Pressable>
                  </>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <Text style={s.sectionTitle}>Delivery Method</Text>
                {([
                  { id: "standard" as const, icon: "car-outline", title: "Standard Delivery", sub: `7 business days · Est. ${getDeliveryDate("standard")}`, price: "Free" },
                  { id: "express" as const, icon: "flash-outline", title: "Express Delivery", sub: `3 business days · Est. ${getDeliveryDate("express")}`, price: "Free" },
                ] as const).map((opt) => (
                  <Pressable
                    key={opt.id}
                    onPress={() => setDeliveryMethod(opt.id)}
                    style={[s.optionCard, {
                      borderColor: deliveryMethod === opt.id ? colors.primary : colors.border + "44",
                      backgroundColor: deliveryMethod === opt.id ? colors.primary + "08" : colors.card,
                    }]}
                  >
                    <View style={[s.optionIcon, { backgroundColor: deliveryMethod === opt.id ? colors.primary : colors.muted }]}>
                      <Ionicons name={opt.icon} size={20} color={deliveryMethod === opt.id ? colors.primaryForeground : colors.mutedForeground} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.optionTitle}>{opt.title}</Text>
                      <Text style={s.optionSub}>{opt.sub}</Text>
                    </View>
                    <Text style={[s.optionPrice, { color: opt.price === "Free" ? "#22A66A" : colors.foreground }]}>{opt.price}</Text>
                    {deliveryMethod === opt.id && <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={{ marginLeft: 8 }} />}
                  </Pressable>
                ))}
              </>
            )}

            {step === 3 && (
              <>
                <Text style={s.sectionTitle}>Payment Method</Text>

                {/* Saved payment methods */}
                {!paymentMethodsLoading && savedPaymentMethods.length > 0 && (
                  <>
                    <Text style={[s.label, { marginBottom: 8 }]}>Saved Methods</Text>
                    {savedPaymentMethods.map((pm) => {
                      const pmType: PaymentMethod = pm.type === "card" ? "card" : "upi";
                      const isSelected = !enteringNewPayment && selectedSavedPaymentId === pm.id;
                      const displayLabel = pm.type === "card"
                        ? `${pm.cardBrand} •••• ${pm.last4} (${String(pm.expiryMonth).padStart(2, "0")}/${pm.expiryYear})`
                        : pm.upiId;
                      const iconName = pm.type === "card" ? "card-outline" : "phone-portrait-outline";
                      return (
                        <Pressable
                          key={pm.id}
                          onPress={() => {
                            setSelectedSavedPaymentId(pm.id);
                            setPaymentMethod(pmType);
                            setEnteringNewPayment(false);
                          }}
                          style={[s.optionCard, {
                            borderColor: isSelected ? colors.primary : colors.border + "44",
                            backgroundColor: isSelected ? colors.primary + "08" : colors.card,
                          }]}
                        >
                          <View style={[s.optionIcon, { backgroundColor: isSelected ? colors.primary : colors.muted }]}>
                            <Ionicons name={iconName} size={20} color={isSelected ? colors.primaryForeground : colors.mutedForeground} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.optionTitle}>{displayLabel}</Text>
                            {pm.cardholderName && <Text style={s.optionSub}>{pm.cardholderName}</Text>}
                          </View>
                          {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => {
                        setEnteringNewPayment(true);
                        setSelectedSavedPaymentId(null);
                      }}
                      style={[s.optionCard, {
                        borderColor: enteringNewPayment ? colors.primary : colors.border + "44",
                        backgroundColor: enteringNewPayment ? colors.primary + "08" : colors.card,
                        borderStyle: "dashed",
                      }]}
                    >
                      <View style={[s.optionIcon, { backgroundColor: enteringNewPayment ? colors.primary : colors.muted }]}>
                        <Ionicons name="add-outline" size={20} color={enteringNewPayment ? colors.primaryForeground : colors.mutedForeground} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.optionTitle}>Use a new card or UPI</Text>
                      </View>
                      {enteringNewPayment && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                    </Pressable>
                  </>
                )}

                {/* Payment type selector — shown when entering new or no saved methods */}
                {(enteringNewPayment || savedPaymentMethods.length === 0) && (
                  <>
                    {savedPaymentMethods.length > 0 && (
                      <Text style={[s.label, { marginBottom: 8, marginTop: 4 }]}>New Payment</Text>
                    )}
                    {([
                      { id: "upi" as const, icon: "phone-portrait-outline", title: "UPI", sub: "Pay via UPI ID (Google Pay, PhonePe, etc.)" },
                      { id: "card" as const, icon: "card-outline", title: "Credit / Debit Card", sub: "Visa, Mastercard, RuPay" },
                      { id: "cod" as const, icon: "cash-outline", title: "Cash on Delivery", sub: "Pay when you receive your order" },
                    ] as const).map((opt) => (
                      <Pressable
                        key={opt.id}
                        onPress={() => setPaymentMethod(opt.id)}
                        style={[s.optionCard, {
                          borderColor: paymentMethod === opt.id ? colors.primary : colors.border + "44",
                          backgroundColor: paymentMethod === opt.id ? colors.primary + "08" : colors.card,
                        }]}
                      >
                        <View style={[s.optionIcon, { backgroundColor: paymentMethod === opt.id ? colors.primary : colors.muted }]}>
                          <Ionicons name={opt.icon} size={20} color={paymentMethod === opt.id ? colors.primaryForeground : colors.mutedForeground} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.optionTitle}>{opt.title}</Text>
                          <Text style={s.optionSub}>{opt.sub}</Text>
                        </View>
                        {paymentMethod === opt.id && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                      </Pressable>
                    ))}

                    {paymentMethod === "upi" && (
                      <View style={s.card}>
                        <Text style={s.label}>UPI ID</Text>
                        <TextInput style={s.inputBox} value={upiId} onChangeText={setUpiId} placeholder="yourname@upi" placeholderTextColor={colors.mutedForeground + "88"} autoCapitalize="none" keyboardType="email-address" />
                        <Pressable style={s.checkRow} onPress={() => setSavePaymentMethod((v) => !v)}>
                          <View style={[s.checkBox, { borderColor: savePaymentMethod ? colors.primary : colors.border, backgroundColor: savePaymentMethod ? colors.primary : "transparent" }]}>
                            {savePaymentMethod && <Ionicons name="checkmark" size={13} color={colors.primaryForeground} />}
                          </View>
                          <Text style={s.checkLabel}>Save for future purchases</Text>
                        </Pressable>
                      </View>
                    )}

                    {paymentMethod === "card" && (
                      <View style={s.card}>
                        <Text style={s.label}>Cardholder Name</Text>
                        <TextInput style={s.inputBox} value={cardName} onChangeText={setCardName} placeholder="As on card" placeholderTextColor={colors.mutedForeground + "88"} />
                        <Text style={s.label}>Card Number</Text>
                        <TextInput style={s.inputBox} value={cardNumber} onChangeText={(v) => setCardNumber(v.replace(/\D/g, "").slice(0, 16))} placeholder="1234 5678 9012 3456" placeholderTextColor={colors.mutedForeground + "88"} keyboardType="numeric" />
                        <View style={s.row2}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.label}>Expiry</Text>
                            <TextInput style={s.inputBox} value={cardExpiry} onChangeText={setCardExpiry} placeholder="MM/YY" placeholderTextColor={colors.mutedForeground + "88"} keyboardType="numeric" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.label}>CVV</Text>
                            <TextInput style={s.inputBox} value={cardCvv} onChangeText={(v) => setCardCvv(v.replace(/\D/g, "").slice(0, 3))} placeholder="•••" placeholderTextColor={colors.mutedForeground + "88"} keyboardType="numeric" secureTextEntry />
                          </View>
                        </View>
                        <Pressable style={s.checkRow} onPress={() => setSavePaymentMethod((v) => !v)}>
                          <View style={[s.checkBox, { borderColor: savePaymentMethod ? colors.primary : colors.border, backgroundColor: savePaymentMethod ? colors.primary : "transparent" }]}>
                            {savePaymentMethod && <Ionicons name="checkmark" size={13} color={colors.primaryForeground} />}
                          </View>
                          <Text style={s.checkLabel}>Save for future purchases</Text>
                        </Pressable>
                      </View>
                    )}
                  </>
                )}
              </>
            )}

            {step === 4 && (
              <>
                <Text style={s.sectionTitle}>Review Order</Text>

                <View style={s.card}>
                  <Text style={[s.label, { marginTop: 0 }]}>Items ({orderItems.reduce((s, i) => s + i.quantity, 0)})</Text>
                  {orderItems.map((item, idx) => (
                    <View key={`${item.productId}-${idx}`} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: idx < orderItems.length - 1 ? 1 : 0, borderBottomColor: colors.border + "22" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.foreground }} numberOfLines={2}>{item.name}</Text>
                        <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>{item.vendorName} · Qty {item.quantity}</Text>
                      </View>
                      <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 13, color: colors.foreground }}>₹{(item.price * item.quantity).toLocaleString("en-IN")}</Text>
                    </View>
                  ))}
                </View>

                <View style={s.card}>
                  <Text style={[s.label, { marginTop: 0 }]}>Shipping to</Text>
                  <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.foreground }}>{address.name} · {address.phone}</Text>
                  <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                    {[address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(", ")}
                  </Text>
                  <View style={s.divider} />
                  <Text style={[s.label, { marginTop: 0 }]}>Delivery · Payment</Text>
                  <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.foreground }}>
                    {deliveryMethod === "express" ? "⚡ Express (3 days)" : "🚚 Standard (7 days)"} · Est. {getDeliveryDate(deliveryMethod)}
                  </Text>
                  <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                    {paymentMethod === "upi" ? "UPI" : paymentMethod === "card" ? "Credit / Debit Card" : "Cash on Delivery"}
                  </Text>
                </View>

                <View style={s.card}>
                  <Text style={[s.label, { marginTop: 0, marginBottom: 10 }]}>Apply Coupon</Text>
                  {appliedCoupon ? (
                    <>
                      <View style={[s.appliedCoupon, couponOrderError ? { backgroundColor: colors.destructive + "15", borderColor: colors.destructive + "33", borderWidth: 1 } : {}]}>
                        <Ionicons name={couponOrderError ? "close-circle" : "pricetag"} size={16} color={couponOrderError ? colors.destructive : "#22A66A"} />
                        <Text style={[s.appliedCouponText, couponOrderError ? { color: colors.destructive } : {}]}>"{appliedCoupon.code}" applied</Text>
                        <Pressable onPress={() => { setAppliedCoupon(null); setCouponOrderError(""); }}>
                          <Ionicons name="close-circle" size={18} color={couponOrderError ? colors.destructive : "#22A66A"} />
                        </Pressable>
                      </View>
                      {couponOrderError ? (
                        <View style={{ backgroundColor: colors.destructive + "10", borderRadius: 8, padding: 10, marginTop: 6 }}>
                          <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.destructive, marginBottom: 6 }}>{couponOrderError}</Text>
                          <Pressable onPress={() => { setAppliedCoupon(null); setCouponOrderError(""); }}>
                            <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 12, color: colors.destructive, textDecorationLine: "underline" }}>Remove coupon and continue without discount</Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {couponExpiringSoon ? (
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#F59E0B15", borderColor: "#F59E0B33", borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8 }}>
                          <Ionicons name="warning" size={16} color="#B45309" style={{ marginTop: 1 }} />
                          <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: "#B45309", flex: 1 }}>
                            This coupon expires in {couponDaysLeft} day{couponDaysLeft !== 1 ? "s" : ""} — complete your order soon to use it.
                          </Text>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <View style={s.couponRow}>
                        <TextInput style={s.couponInput} value={couponCode} onChangeText={(v) => setCouponCode(v.toUpperCase())} placeholder="Enter coupon code" placeholderTextColor={colors.mutedForeground + "88"} autoCapitalize="characters" />
                        <Pressable style={s.couponApplyBtn} onPress={applyCoupon} disabled={couponLoading || !couponCode}>
                          {couponLoading ? <ActivityIndicator size="small" color={colors.secondaryForeground} /> : <Text style={s.couponApplyText}>Apply</Text>}
                        </Pressable>
                      </View>
                      {couponError ? <Text style={s.couponError}>{couponError}</Text> : null}
                    </>
                  )}
                  <View style={s.divider} />
                  <PriceRow label="Total MRP" value={`₹${totalMRP.toLocaleString("en-IN")}`} />
                  {mrpDiscount > 0 && (
                    <PriceRow label="Discount on MRP" value={`− ₹${mrpDiscount.toLocaleString("en-IN")}`} green />
                  )}
                  <PriceRow label="Product Price" value={`₹${totalSellingPrice.toLocaleString("en-IN")}`} />
                  {discount > 0 && <PriceRow label={`Coupon Discount (${appliedCoupon?.code})`} value={`− ₹${discount.toLocaleString("en-IN")}`} green />}
                  <PriceRow label="Platform Fee" value={`₹${platformFee}`} />
                  {paymentMethod === "cod" && <PriceRow label="Cash on Delivery Fee" value={`₹${codFee}`} />}
                  <PriceRow label="Shipping" value={shippingCost === 0 ? "Free" : `₹${shippingCost}`} green={shippingCost === 0} />
                  <View style={s.divider} />
                  <PriceRow label="Total Payable" value={`₹${total.toLocaleString("en-IN")}`} highlight />
                </View>

                {placeError ? (
                  <View style={s.errorBox}>
                    <Text style={s.errorBoxText}>{placeError}</Text>
                  </View>
                ) : null}
              </>
            )}

            <View style={{ height: 120 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={s.ctaArea}>
        {step < 4 && step > 1 && (
          <Pressable style={s.secondaryBtn} onPress={() => setStep(step - 1)}>
            <Text style={s.secondaryBtnText}>Back</Text>
          </Pressable>
        )}
        {step === 1 && (
          <Pressable
            testID="checkout-continue-1"
            style={[s.primaryBtn, !validateAddress() && { opacity: 0.5 }]}
            onPress={async () => {
              if (!validateAddress()) return;
              setAddressSaveError("");
              if (saveAddress && enteringNew && !selectedSavedId) {
                try {
                  const token = await getToken();
                  const r = await fetch(`${API_BASE}/api/addresses`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ ...address }),
                  });
                  if (r.ok) {
                    const data = await r.json();
                    setSavedAddresses((prev) => [data.address, ...prev]);
                    setSelectedSavedId(data.address.id);
                  } else {
                    setAddressSaveError("We couldn't save this address for next time, but your order will still use it.");
                  }
                } catch {
                  setAddressSaveError("We couldn't save this address for next time, but your order will still use it.");
                }
              }
              setStep(2);
            }}
            disabled={!validateAddress()}
          >
            <Text style={s.primaryBtnText}>Continue to Delivery</Text>
          </Pressable>
        )}
        {step === 2 && (
          <Pressable testID="checkout-continue-2" style={s.primaryBtn} onPress={() => setStep(3)}>
            <Text style={s.primaryBtnText}>Continue to Payment</Text>
          </Pressable>
        )}
        {step === 3 && (
          <Pressable testID="checkout-continue-3" style={s.primaryBtn} onPress={() => setStep(4)}>
            <Text style={s.primaryBtnText}>Review Order</Text>
          </Pressable>
        )}
        {step === 4 && (
          <Pressable testID="checkout-place-order" style={[s.primaryBtn, placing && { opacity: 0.6 }]} onPress={placeOrder} disabled={placing}>
            {placing
              ? <ActivityIndicator color={colors.primaryForeground} />
              : <Text style={s.primaryBtnText}>Place Order · ₹{total.toLocaleString("en-IN")}</Text>
            }
          </Pressable>
        )}
      </View>
    </View>
  );
}
