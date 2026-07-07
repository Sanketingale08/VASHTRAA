import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  status: string; createdAt: string;
};

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

export default function OrderConfirmationScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn, isLoaded, getToken } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      backgroundColor: "#E8F5EE",
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
      backgroundColor: "#E8F5EE",
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    statusText: { fontFamily: "DMSans_700Bold", fontSize: 11, color: "#22A66A", textTransform: "capitalize" },
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
  });

  if (!isLoaded || loading) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Pressable onPress={() => router.replace("/(tabs)")} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={s.headerTitle}>Order Confirmation</Text>
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
          <Pressable onPress={() => router.replace("/(tabs)")} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={s.headerTitle}>Order Not Found</Text>
        </View>
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
          <Text style={[s.successTitle, { fontSize: 22, marginTop: 12 }]}>Order Not Found</Text>
          <Text style={s.successSub}>{error || "This order doesn't exist or belongs to another account."}</Text>
          <Pressable style={[s.primaryBtn, { width: "100%" }]} onPress={() => router.replace("/(tabs)")}>
            <Text style={s.primaryBtnText}>Continue Shopping</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const placedAt = new Date(order.createdAt);
  const deliveryEst = getDeliveryDate(order.deliveryMethod, order.createdAt);
  const payLabel = order.paymentMethod === "upi" ? "UPI" : order.paymentMethod === "card" ? "Credit / Debit Card" : "Cash on Delivery";
  const totalItems = (order.items as OrderItem[]).reduce((s, i) => s + i.quantity, 0);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => router.replace("/(tabs)")} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={s.headerTitle}>Order Confirmed!</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 24, paddingBottom: 16, alignItems: "center" }}>
          <View style={s.successCircle}>
            <Ionicons name="checkmark-circle" size={44} color="#22A66A" />
          </View>
          <Text style={s.successTitle}>Order Confirmed!</Text>
          <Text style={s.successSub}>Thank you for shopping with TwirlDrape.</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardLabel}>Order Details</Text>
          <View style={s.metaRow}>
            <View style={s.metaBox}>
              <Text style={s.metaKey}>Order ID</Text>
              <Text style={[s.metaVal, { fontFamily: "DMSans_400Regular", fontSize: 10 }]} numberOfLines={1}>{order.id}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaKey}>Placed On</Text>
              <Text style={s.metaVal}>{placedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaKey}>Status</Text>
              <View style={s.statusBadge}>
                <Ionicons name="checkmark-circle" size={11} color="#22A66A" />
                <Text style={s.statusText}>{order.status}</Text>
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
            <Text style={s.priceValue}>₹{order.subtotal.toLocaleString("en-IN")}</Text>
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
        <Pressable style={s.primaryBtn} onPress={() => router.replace("/(tabs)")}>
          <Text style={s.primaryBtnText}>Continue Shopping</Text>
        </Pressable>
      </View>
    </View>
  );
}
