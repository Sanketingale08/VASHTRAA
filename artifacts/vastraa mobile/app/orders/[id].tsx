import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type OrderItem = { productId: string; name: string; price: number; quantity: number; images: string[]; vendorName: string };
type OrderAddress = { name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string };
type Order = {
  id: string; userId: string; items: OrderItem[]; address: OrderAddress;
  deliveryMethod: "standard" | "express"; paymentMethod: "upi" | "card" | "cod";
  couponCode: string | null; subtotal: number; discount: number; shipping: number; tax: number; total: number;
  status: string; createdAt: string; updatedAt: string;
  cancelReason?: string | null;
  returnReason?: string | null;
  deliveredAt?: string | null;
  refundStatus?: string | null;
  refundProcessedAt?: string | null;
  refundReference?: string | null;
  refundMethod?: string | null;
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: "#E8F5EE", text: "#22A66A" },
  processing: { bg: "#FFF3E0", text: "#E68A00" },
  shipped: { bg: "#E3F0FF", text: "#1A73E8" },
  delivered: { bg: "#E8F5EE", text: "#22A66A" },
  cancelled: { bg: "#FFF0F0", text: "#D93025" },
  return_requested: { bg: "#FFF3E0", text: "#E68A00" },
};

function statusColor(status: string) {
  return STATUS_COLORS[status] ?? { bg: "#F5F5F5", text: "#555" };
}

function statusIcon(status: string): React.ComponentProps<typeof Ionicons>["name"] {
  switch (status) {
    case "confirmed": return "checkmark-circle";
    case "processing": return "time-outline";
    case "shipped": return "car-outline";
    case "delivered": return "checkmark-done-circle";
    case "cancelled": return "close-circle";
    case "return_requested": return "return-down-back-outline";
    default: return "ellipse-outline";
  }
}

function getDeliveryDate(method: "standard" | "express", from: string) {
  const date = new Date(from);
  const days = method === "express" ? 3 : 7;
  let count = 0;
  while (count < days) {
    date.setDate(date.getDate() + 1);
    const d = date.getDay();
    if (d !== 0 && d !== 6) count++;
  }
  return date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

const REFUND_OPTIONS = [
  {
    value: "original_payment",
    label: "Original Payment Method",
    sub: "Refunded to your UPI / card / bank account (5–7 business days)",
  },
  {
    value: "store_credit",
    label: "Store Credit",
    sub: "Added to your VASTRAA wallet instantly",
  },
];

const CANCEL_REASONS = [
  "Changed my mind",
  "Found a better price elsewhere",
  "Ordered by mistake",
  "Delivery time too long",
  "Other",
];

const RETURN_REASONS = [
  "Product is damaged or defective",
  "Wrong item received",
  "Product does not match description",
  "Size or fit issue",
  "Quality not as expected",
  "Other",
];

export default function OrderDetailScreen() {
  const { id: orderId, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const isFromHistory = from === "history";
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn, isLoaded, getToken } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [refundModalVisible, setRefundModalVisible] = useState(false);
  const [refundMethod, setRefundMethod] = useState<"original_payment" | "store_credit" | "">("");
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState("");
  const [refundSuccess, setRefundSuccess] = useState("");

  // Cancel flow
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelCustom, setCancelCustom] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelSuccess, setCancelSuccess] = useState("");

  // Return flow
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnCustom, setReturnCustom] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [returnSuccess, setReturnSuccess] = useState("");

  useEffect(() => {
    if (!isLoaded || !orderId) return;
    if (!isSignedIn) { setLoading(false); return; }
    getToken().then((token) => {
      fetch(`${API_BASE}/api/orders/${orderId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (r) => {
          if (!r.ok) throw new Error("Order not found");
          return r.json();
        })
        .then((data) => setOrder(data.order))
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [isLoaded, isSignedIn, orderId]);

  const handleBack = () => {
    if (isFromHistory) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  async function handleCancelSubmit() {
    if (!order) return;
    const effective = cancelReason === "Other" ? cancelCustom.trim() : cancelReason;
    if (!effective) { setCancelError("Please select a reason."); return; }
    setCancelError("");
    setCancelSubmitting(true);
    try {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/api/orders/${order.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: effective }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to cancel order");
      setOrder((prev) => prev ? { ...prev, status: "cancelled", cancelReason: effective } : prev);
      setCancelModalVisible(false);
      setCancelReason("");
      setCancelCustom("");
      setCancelSuccess("Your order has been cancelled. Stock has been restored.");
    } catch (e: any) {
      setCancelError(e.message);
    } finally {
      setCancelSubmitting(false);
    }
  }

  async function handleReturnSubmit() {
    if (!order) return;
    const effective = returnReason === "Other" ? returnCustom.trim() : returnReason;
    if (!effective) { setReturnError("Please select a reason."); return; }
    setReturnError("");
    setReturnSubmitting(true);
    try {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/api/orders/${order.id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: effective }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to request return");
      setOrder((prev) => prev ? { ...prev, status: "return_requested", returnReason: effective } : prev);
      setReturnModalVisible(false);
      setReturnReason("");
      setReturnCustom("");
      setReturnSuccess("Your return request has been submitted. Our team will reach out within 2 business days with pickup details.");
    } catch (e: any) {
      setReturnError(e.message);
    } finally {
      setReturnSubmitting(false);
    }
  }

  async function handleRefundSubmit() {
    if (!refundMethod || !order) return;
    setRefundError("");
    setRefundSubmitting(true);
    try {
      const token = await getToken();
      const r = await fetch(`${API_BASE}/api/orders/${order.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ method: refundMethod }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to request refund");
      setOrder((prev) => prev ? { ...prev, refundStatus: "pending", refundMethod } : prev);
      setRefundModalVisible(false);
      setRefundMethod("");
      setRefundSuccess(
        refundMethod === "store_credit"
          ? "Refund requested — store credit will be added to your account."
          : "Refund requested — processing in 5–7 business days to your original payment method."
      );
    } catch (e: any) {
      setRefundError(e.message);
    } finally {
      setRefundSubmitting(false);
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
    },
    backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginRight: 8 },
    headerTitle: { fontFamily: "CormorantGaramond_700Bold", fontSize: 22, color: colors.foreground },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
    successCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    successTitle: {
      fontFamily: "CormorantGaramond_700Bold",
      fontSize: 30,
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 6,
    },
    successSub: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 24,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border + "22",
      padding: 14,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    cardLabel: {
      fontFamily: "DMSans_500Medium",
      fontSize: 11,
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    metaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    metaBox: { flex: 1, minWidth: 100 },
    metaKey: { fontFamily: "DMSans_400Regular", fontSize: 11, color: colors.mutedForeground, marginBottom: 2 },
    metaVal: { fontFamily: "DMSans_700Bold", fontSize: 12, color: colors.foreground },
    statusBadge: {
      alignSelf: "flex-start",
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    statusText: { fontFamily: "DMSans_700Bold", fontSize: 11, textTransform: "capitalize" },
    itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
    itemImg: { width: 56, height: 56, borderRadius: colors.radius, backgroundColor: colors.muted },
    itemName: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.foreground, flex: 1 },
    itemVendor: { fontFamily: "DMSans_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 1 },
    itemQty: { fontFamily: "DMSans_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 1 },
    itemPrice: { fontFamily: "DMSans_700Bold", fontSize: 13, color: colors.foreground },
    divider: { height: 1, backgroundColor: colors.border + "33", marginVertical: 8 },
    priceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
    priceLabel: { fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.mutedForeground },
    priceValue: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.foreground },
    totalLabel: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.primary },
    totalValue: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.primary },
    ctaArea: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: Platform.OS === "web" ? 20 : insets.bottom + 16,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border + "22",
      gap: 10,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 15,
      alignItems: "center",
    },
    primaryBtnText: { fontFamily: "DMSans_700Bold", fontSize: 15, color: colors.primaryForeground, letterSpacing: 0.5 },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: colors.border + "66",
      borderRadius: colors.radius,
      paddingVertical: 13,
      alignItems: "center",
    },
    secondaryBtnText: { fontFamily: "DMSans_500Medium", fontSize: 14, color: colors.primary },
    refundBtn: {
      borderWidth: 1,
      borderColor: "#3B82F6" + "66",
      borderRadius: colors.radius,
      paddingVertical: 13,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
    },
    refundBtnText: { fontFamily: "DMSans_700Bold", fontSize: 14, color: "#3B82F6" },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: Platform.OS === "web" ? 28 : insets.bottom + 28,
    },
    modalTitle: { fontFamily: "CormorantGaramond_700Bold", fontSize: 22, color: colors.foreground, marginBottom: 4 },
    modalSub: { fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.mutedForeground, marginBottom: 18 },
    optionCard: {
      borderWidth: 1.5,
      borderRadius: colors.radius,
      padding: 14,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    optionLabel: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.foreground },
    optionSub: { fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    modalSubmitBtn: {
      borderRadius: colors.radius,
      paddingVertical: 15,
      alignItems: "center",
      marginTop: 4,
    },
    modalSubmitText: { fontFamily: "DMSans_700Bold", fontSize: 15, color: "#fff", letterSpacing: 0.5 },
    modalCancelBtn: {
      borderWidth: 1,
      borderColor: colors.border + "66",
      borderRadius: colors.radius,
      paddingVertical: 13,
      alignItems: "center",
      marginTop: 8,
    },
    modalCancelText: { fontFamily: "DMSans_500Medium", fontSize: 14, color: colors.mutedForeground },
    errorText: { fontFamily: "DMSans_400Regular", fontSize: 12, color: "#D93025", marginTop: 8, textAlign: "center" },
    cancelBtn: {
      borderWidth: 1,
      borderColor: "#D93025" + "66",
      borderRadius: colors.radius,
      paddingVertical: 13,
      alignItems: "center" as const,
      flexDirection: "row" as const,
      justifyContent: "center" as const,
      gap: 6,
    },
    cancelBtnText: { fontFamily: "DMSans_700Bold", fontSize: 14, color: "#D93025" },
    returnBtn: {
      borderWidth: 1,
      borderColor: "#E68A00" + "66",
      borderRadius: colors.radius,
      paddingVertical: 13,
      alignItems: "center" as const,
      flexDirection: "row" as const,
      justifyContent: "center" as const,
      gap: 6,
    },
    returnBtnText: { fontFamily: "DMSans_700Bold", fontSize: 14, color: "#E68A00" },
    reasonOption: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + "22",
    },
    reasonText: { fontFamily: "DMSans_400Regular", fontSize: 14, color: colors.foreground, flex: 1 },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    radioInner: { width: 10, height: 10, borderRadius: 5 },
    customReasonInput: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.border + "66",
      borderRadius: colors.radius,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.foreground,
      backgroundColor: colors.card,
      minHeight: 72,
      textAlignVertical: "top" as const,
    },
  });

  const headerTitle = isFromHistory ? "Order Details" : "Order Confirmed!";

  if (!isLoaded || loading) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Pressable onPress={handleBack} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={s.headerTitle}>{headerTitle}</Text>
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Pressable onPress={handleBack} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={s.headerTitle}>Order Not Found</Text>
        </View>
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
          <Text style={[s.successTitle, { fontSize: 22, marginTop: 12 }]}>Order Not Found</Text>
          <Text style={s.successSub}>{error || "This order doesn't exist or belongs to another account."}</Text>
          <Pressable style={[s.primaryBtn, { width: "100%" }]} onPress={handleBack}>
            <Text style={s.primaryBtnText}>{isFromHistory ? "Back to Orders" : "Continue Shopping"}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const placedAt = new Date(order.createdAt);
  const deliveryEst = getDeliveryDate(order.deliveryMethod, order.createdAt);
  const payLabel = order.paymentMethod === "upi" ? "UPI" : order.paymentMethod === "card" ? "Credit / Debit Card" : "Cash on Delivery";
  const totalItems = (order.items as OrderItem[]).reduce((s, i) => s + i.quantity, 0);
  const sc = statusColor(order.status);

  const canCancel = ["confirmed", "processing"].includes(order.status);
  const deliveryTimestamp = order.deliveredAt
    ? new Date(order.deliveredAt)
    : new Date(order.updatedAt);
  const canReturn =
    order.status === "delivered" &&
    (Date.now() - deliveryTimestamp.getTime()) / (1000 * 60 * 60 * 24) <= 7;
  const canRefund = ["cancelled", "return_requested"].includes(order.status) && !order.refundStatus;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable onPress={handleBack} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={s.headerTitle}>{headerTitle}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {!isFromHistory && (
          <View style={{ paddingTop: 24, paddingBottom: 16, alignItems: "center" }}>
            <View style={[s.successCircle, { backgroundColor: "#E8F5EE" }]}>
              <Ionicons name="checkmark-circle" size={44} color="#22A66A" />
            </View>
            <Text testID="order-confirmed-title" style={s.successTitle}>Order Confirmed!</Text>
            <Text style={s.successSub}>Thank you for shopping with VASTRAA.</Text>
          </View>
        )}

        {isFromHistory && <View style={{ height: 16 }} />}

        <View style={s.card}>
          <Text style={s.cardLabel}>Order Details</Text>
          <View style={s.metaRow}>
            <View style={s.metaBox}>
              <Text style={s.metaKey}>Order ID</Text>
              <Text testID="order-id-value" style={[s.metaVal, { fontFamily: "DMSans_400Regular", fontSize: 10 }]} numberOfLines={1}>{order.id}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaKey}>Placed On</Text>
              <Text style={s.metaVal}>{placedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaKey}>Status</Text>
              <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                <Ionicons name={statusIcon(order.status)} size={11} color={sc.text} />
                <Text style={[s.statusText, { color: sc.text }]}>{order.status.replace("_", " ")}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardLabel}>Items Ordered ({totalItems})</Text>
          {(order.items as OrderItem[]).map((item, idx) => (
            <View key={`${item.productId}-${idx}`} style={[s.itemRow, idx < order.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border + "22" }]}>
              <Image
                source={{ uri: item.images?.[0] }}
                style={s.itemImg}
                contentFit="cover"
                transition={200}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.itemName} numberOfLines={2}>{item.name}</Text>
                <Text style={s.itemVendor}>{item.vendorName}</Text>
                <Text style={s.itemQty}>Qty: {item.quantity} × ₹{item.price.toLocaleString("en-IN")}</Text>
              </View>
              <Text style={s.itemPrice}>₹{(item.price * item.quantity).toLocaleString("en-IN")}</Text>
            </View>
          ))}
        </View>

        <View style={s.card}>
          <Text style={s.cardLabel}>Price Breakdown</Text>
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Subtotal</Text>
            <Text style={s.priceValue}>₹{(order.subtotal ?? ((order.items && order.items.length > 0) ? order.items.reduce((s: number, i: any) => s + (i.price ?? 0) * i.quantity, 0) : 0)).toLocaleString("en-IN")}</Text>
          </View>
          {order.discount > 0 && (
            <View style={s.priceRow}>
              <Text style={[s.priceLabel, { color: "#22A66A" }]}>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</Text>
              <Text style={[s.priceValue, { color: "#22A66A" }]}>− ₹{order.discount.toLocaleString("en-IN")}</Text>
            </View>
          )}
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Shipping</Text>
            <Text style={order.shipping === 0 ? [s.priceValue, { color: "#22A66A" }] : s.priceValue}>
              {order.shipping === 0 ? "Free" : `₹${order.shipping}`}
            </Text>
          </View>
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>GST (5%)</Text>
            <Text style={s.priceValue}>₹{order.tax.toLocaleString("en-IN")}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.priceRow}>
            <Text style={s.totalLabel}>Total Paid</Text>
            <Text style={s.totalValue}>₹{order.total.toLocaleString("en-IN")}</Text>
          </View>
        </View>

        {/* Refund status banners */}
        {order.refundStatus === "processed" && (
          <View style={[s.card, { borderColor: "#22A66A55", backgroundColor: "#F0FBF5" }]}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <Ionicons name="checkmark-circle" size={18} color="#22A66A" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={[s.cardLabel, { color: "#22A66A", marginBottom: 4 }]}>Refund Payout</Text>
                <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 14, color: "#1A7A50" }}>
                  {"Refund paid out"}
                  {order.refundProcessedAt
                    ? ` on ${new Date(order.refundProcessedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`
                    : ""}
                </Text>
                {order.refundMethod && (
                  <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: "#3A9468", marginTop: 3 }}>
                    Via: {order.refundMethod === "store_credit" ? "Store Credit" : "Original Payment Method"}
                  </Text>
                )}
                {order.refundReference && (
                  <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: "#3A9468", marginTop: 2 }}>
                    {"Reference: "}
                    <Text style={{ fontFamily: "DMSans_700Bold" }}>{order.refundReference}</Text>
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {order.refundStatus === "approved" && (
          <View style={[s.card, { borderColor: "#3B82F655", backgroundColor: "#EFF6FF" }]}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <Ionicons name="refresh-circle" size={18} color="#3B82F6" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={[s.cardLabel, { color: "#3B82F6", marginBottom: 4 }]}>Refund Approved</Text>
                <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 14, color: "#1D4ED8" }}>
                  Refund approved — payout in progress
                </Text>
                {order.refundMethod && (
                  <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: "#3B82F6", marginTop: 3 }}>
                    Via: {order.refundMethod === "store_credit" ? "Store Credit" : "Original Payment Method"}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {order.refundStatus === "pending" && (
          <View style={[s.card, { borderColor: "#3B82F655", backgroundColor: "#EFF6FF" }]}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <Ionicons name="time-outline" size={18} color="#3B82F6" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={[s.cardLabel, { color: "#3B82F6", marginBottom: 4 }]}>Refund Requested</Text>
                <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 14, color: "#1D4ED8" }}>
                  Refund requested — processing in 5–7 business days
                </Text>
                {order.refundMethod && (
                  <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: "#3B82F6", marginTop: 3 }}>
                    Via: {order.refundMethod === "store_credit" ? "Store Credit" : "Original Payment Method"}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Refund success confirmation message */}
        {refundSuccess ? (
          <View style={[s.card, { borderColor: "#22A66A55", backgroundColor: "#F0FBF5" }]}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <Ionicons name="checkmark-circle" size={18} color="#22A66A" style={{ marginTop: 1 }} />
              <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 13, color: "#1A7A50", flex: 1 }}>{refundSuccess}</Text>
            </View>
          </View>
        ) : null}

        <View style={s.card}>
          <Text style={s.cardLabel}>Shipping Address</Text>
          <Text style={{ fontFamily: "DMSans_700Bold", fontSize: 13, color: colors.foreground }}>{(order.address as OrderAddress).name}</Text>
          <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{(order.address as OrderAddress).phone}</Text>
          <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 4 }}>
            {[(order.address as OrderAddress).line1, (order.address as OrderAddress).line2, (order.address as OrderAddress).city, (order.address as OrderAddress).state, (order.address as OrderAddress).pincode].filter(Boolean).join(", ")}
          </Text>
          <View style={s.divider} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name={order.deliveryMethod === "express" ? "flash-outline" : "car-outline"} size={14} color={colors.secondary} />
            <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.foreground }}>
              {order.deliveryMethod === "express" ? "⚡ Express (3 days)" : "🚚 Standard (7 days)"}
            </Text>
          </View>
          <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
            Est. delivery: <Text style={{ fontFamily: "DMSans_700Bold", color: colors.primary }}>{deliveryEst}</Text>
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
            <Ionicons name="card-outline" size={14} color={colors.secondary} />
            <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.foreground }}>{payLabel}</Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={s.ctaArea}>
        {canCancel && (
          <Pressable style={s.cancelBtn} onPress={() => { setCancelModalVisible(true); setCancelError(""); setCancelReason(""); setCancelCustom(""); }}>
            <Ionicons name="close-circle-outline" size={16} color="#D93025" />
            <Text style={s.cancelBtnText}>Cancel Order</Text>
          </Pressable>
        )}
        {canReturn && (
          <Pressable style={s.returnBtn} onPress={() => { setReturnModalVisible(true); setReturnError(""); setReturnReason(""); setReturnCustom(""); }}>
            <Ionicons name="return-down-back-outline" size={16} color="#E68A00" />
            <Text style={s.returnBtnText}>Request Return</Text>
          </Pressable>
        )}
        {canRefund && (
          <Pressable style={s.refundBtn} onPress={() => { setRefundModalVisible(true); setRefundError(""); setRefundMethod(""); }}>
            <Ionicons name="refresh-outline" size={16} color="#3B82F6" />
            <Text style={s.refundBtnText}>Request Refund</Text>
          </Pressable>
        )}
        {isFromHistory ? (
          <Pressable style={s.primaryBtn} onPress={() => router.push("/(tabs)/explore")}>
            <Text style={s.primaryBtnText}>Browse More Sarees</Text>
          </Pressable>
        ) : (
          <Pressable style={s.primaryBtn} onPress={() => router.replace("/(tabs)")}>
            <Text style={s.primaryBtnText}>Continue Shopping</Text>
          </Pressable>
        )}
      </View>

      {/* Cancel order modal */}
      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !cancelSubmitting && setCancelModalVisible(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => !cancelSubmitting && setCancelModalVisible(false)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <Text style={s.modalTitle}>Why do you want to cancel?</Text>
            <Text style={s.modalSub}>Please select a reason for cancellation.</Text>

            {CANCEL_REASONS.map((r) => (
              <Pressable
                key={r}
                style={s.reasonOption}
                onPress={() => setCancelReason(r)}
              >
                <View style={[
                  s.radioOuter,
                  { borderColor: cancelReason === r ? colors.primary : colors.border + "88" },
                ]}>
                  {cancelReason === r && (
                    <View style={[s.radioInner, { backgroundColor: colors.primary }]} />
                  )}
                </View>
                <Text style={s.reasonText}>{r}</Text>
              </Pressable>
            ))}

            {cancelReason === "Other" && (
              <TextInput
                style={s.customReasonInput}
                placeholder="Please describe your reason…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                value={cancelCustom}
                onChangeText={setCancelCustom}
              />
            )}

            {cancelError ? (
              <Text style={s.errorText}>{cancelError}</Text>
            ) : null}

            {(() => {
              const cancelReady = !!cancelReason && (cancelReason !== "Other" || cancelCustom.trim().length > 0) && !cancelSubmitting;
              return (
                <Pressable
                  testID="cancel-submit-btn"
                  style={[
                    s.modalSubmitBtn,
                    { backgroundColor: cancelReady ? "#D93025" : colors.muted, marginTop: 14 },
                  ]}
                  onPress={handleCancelSubmit}
                  disabled={!cancelReady}
                >
                  <Text style={[s.modalSubmitText, { color: cancelReady ? "#fff" : colors.mutedForeground }]}>
                    {cancelSubmitting ? "Please wait…" : "Confirm Cancellation"}
                  </Text>
                </Pressable>
              );
            })()}

            <Pressable
              style={s.modalCancelBtn}
              onPress={() => setCancelModalVisible(false)}
              disabled={cancelSubmitting}
            >
              <Text style={s.modalCancelText}>Keep Order</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Return request modal */}
      <Modal
        visible={returnModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !returnSubmitting && setReturnModalVisible(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => !returnSubmitting && setReturnModalVisible(false)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <Text style={s.modalTitle}>Why do you want to return?</Text>
            <Text style={s.modalSub}>Returns accepted within 7 days of delivery.</Text>

            {RETURN_REASONS.map((r) => (
              <Pressable
                key={r}
                style={s.reasonOption}
                onPress={() => setReturnReason(r)}
              >
                <View style={[
                  s.radioOuter,
                  { borderColor: returnReason === r ? colors.primary : colors.border + "88" },
                ]}>
                  {returnReason === r && (
                    <View style={[s.radioInner, { backgroundColor: colors.primary }]} />
                  )}
                </View>
                <Text style={s.reasonText}>{r}</Text>
              </Pressable>
            ))}

            {returnReason === "Other" && (
              <TextInput
                style={s.customReasonInput}
                placeholder="Please describe your reason…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                value={returnCustom}
                onChangeText={setReturnCustom}
              />
            )}

            {returnError ? (
              <Text style={s.errorText}>{returnError}</Text>
            ) : null}

            {(() => {
              const returnReady = !!returnReason && (returnReason !== "Other" || returnCustom.trim().length > 0) && !returnSubmitting;
              return (
                <Pressable
                  testID="return-submit-btn"
                  style={[
                    s.modalSubmitBtn,
                    { backgroundColor: returnReady ? "#E68A00" : colors.muted, marginTop: 14 },
                  ]}
                  onPress={handleReturnSubmit}
                  disabled={!returnReady}
                >
                  <Text style={[s.modalSubmitText, { color: returnReady ? "#fff" : colors.mutedForeground }]}>
                    {returnSubmitting ? "Please wait…" : "Submit Return Request"}
                  </Text>
                </Pressable>
              );
            })()}

            <Pressable
              style={s.modalCancelBtn}
              onPress={() => setReturnModalVisible(false)}
              disabled={returnSubmitting}
            >
              <Text style={s.modalCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Refund method selector modal */}
      <Modal
        visible={refundModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRefundModalVisible(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => !refundSubmitting && setRefundModalVisible(false)}>
          <Pressable style={s.modalSheet} onPress={() => {}}>
            <Text style={s.modalTitle}>Request a Refund</Text>
            <Text style={s.modalSub}>Choose how you'd like to receive your refund.</Text>

            {REFUND_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  s.optionCard,
                  {
                    borderColor: refundMethod === opt.value ? colors.secondary : colors.border + "55",
                    backgroundColor: refundMethod === opt.value ? colors.secondary + "10" : colors.card,
                  },
                ]}
                onPress={() => setRefundMethod(opt.value as "original_payment" | "store_credit")}
              >
                <View style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: refundMethod === opt.value ? colors.secondary : colors.border + "88",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}>
                  {refundMethod === opt.value && (
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.secondary }} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.optionLabel}>{opt.label}</Text>
                  <Text style={s.optionSub}>{opt.sub}</Text>
                </View>
              </Pressable>
            ))}

            {refundError ? (
              <Text style={s.errorText}>{refundError}</Text>
            ) : null}

            <Pressable
              testID="refund-submit-btn"
              style={[
                s.modalSubmitBtn,
                { backgroundColor: refundMethod && !refundSubmitting ? colors.primary : colors.muted },
              ]}
              onPress={handleRefundSubmit}
              disabled={!refundMethod || refundSubmitting}
            >
              <Text style={[s.modalSubmitText, { color: refundMethod && !refundSubmitting ? colors.primaryForeground : colors.mutedForeground }]}>
                {refundSubmitting ? "Please wait…" : "Submit Refund Request"}
              </Text>
            </Pressable>

            <Pressable
              style={s.modalCancelBtn}
              onPress={() => setRefundModalVisible(false)}
              disabled={refundSubmitting}
            >
              <Text style={s.modalCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
