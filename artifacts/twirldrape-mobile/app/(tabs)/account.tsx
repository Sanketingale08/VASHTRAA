import { Ionicons } from "@expo/vector-icons";
import { useAuth, useUser } from "@clerk/expo";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type OrderItem = { productId: string; name: string; price: number; quantity: number; images: string[]; vendorName: string };
type Order = {
  id: string;
  items: OrderItem[];
  total: number;
  status: string;
  createdAt: string;
  deliveryMethod: "standard" | "express";
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: "#E8F5EE", text: "#22A66A" },
  processing: { bg: "#FFF3E0", text: "#E68A00" },
  shipped: { bg: "#E3F0FF", text: "#1A73E8" },
  delivered: { bg: "#E8F5EE", text: "#22A66A" },
  cancelled: { bg: "#FFF0F0", text: "#D93025" },
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
    default: return "ellipse-outline";
  }
}

export default function AccountScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn, isLoaded, getToken, signOut } = useAuth();
  const { user } = useUser();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (!isSignedIn) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load orders");
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    if (isLoaded) fetchOrders();
  }, [isLoaded, fetchOrders]);

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      if (isLoaded && isSignedIn) fetchOrders();
    }, [isLoaded, isSignedIn, fetchOrders])
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const interval = setInterval(() => {
      fetchOrders();
    }, 60000);
    return () => clearInterval(interval);
  }, [isLoaded, isSignedIn, fetchOrders]);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 20 : insets.top + 8,
      paddingBottom: 14,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + "22",
    },
    headerTitle: { fontFamily: "CormorantGaramond_700Bold", fontSize: 28, color: colors.foreground },
    profileCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border + "22",
      padding: 16,
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 20,
      gap: 14,
    },
    avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.muted },
    avatarPlaceholder: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: colors.primary + "22",
      alignItems: "center", justifyContent: "center",
    },
    nameText: { fontFamily: "DMSans_700Bold", fontSize: 15, color: colors.foreground },
    emailText: { fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    signOutBtn: { marginLeft: "auto" as any, padding: 8 },
    sectionTitle: {
      fontFamily: "DMSans_500Medium",
      fontSize: 11,
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginHorizontal: 16,
      marginBottom: 10,
    },
    orderCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border + "22",
      marginHorizontal: 16,
      marginBottom: 10,
      overflow: "hidden",
    },
    orderCardInner: { padding: 14 },
    orderTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    orderId: { fontFamily: "DMSans_400Regular", fontSize: 10, color: colors.mutedForeground },
    statusBadge: {
      flexDirection: "row", alignItems: "center", gap: 4,
      borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    },
    statusText: { fontFamily: "DMSans_700Bold", fontSize: 11, textTransform: "capitalize" },
    imagesRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
    itemThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.muted },
    moreThumb: {
      width: 48, height: 48, borderRadius: 8,
      backgroundColor: colors.muted,
      alignItems: "center", justifyContent: "center",
    },
    moreThumbText: { fontFamily: "DMSans_700Bold", fontSize: 13, color: colors.mutedForeground },
    orderBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    orderDate: { fontFamily: "DMSans_400Regular", fontSize: 11, color: colors.mutedForeground },
    orderTotal: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.foreground },
    divider: { height: 1, backgroundColor: colors.border + "22", marginHorizontal: 0 },
    viewDetails: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      paddingVertical: 10, gap: 4,
    },
    viewDetailsText: { fontFamily: "DMSans_500Medium", fontSize: 12, color: colors.primary },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
    emptyTitle: {
      fontFamily: "CormorantGaramond_700Bold", fontSize: 24, color: colors.foreground,
      marginTop: 16, textAlign: "center",
    },
    emptySubtitle: {
      fontFamily: "DMSans_400Regular", fontSize: 14, color: colors.mutedForeground,
      textAlign: "center", marginTop: 8, marginBottom: 24,
    },
    shopBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingHorizontal: 32, paddingVertical: 14,
    },
    shopBtnText: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.primaryForeground, letterSpacing: 0.5 },
    signInPrompt: {
      flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32,
    },
    signInTitle: {
      fontFamily: "CormorantGaramond_700Bold", fontSize: 26, color: colors.foreground,
      textAlign: "center", marginTop: 16, marginBottom: 8,
    },
    signInSub: {
      fontFamily: "DMSans_400Regular", fontSize: 14, color: colors.mutedForeground,
      textAlign: "center", marginBottom: 24,
    },
    signInBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingHorizontal: 36, paddingVertical: 14,
    },
    signInBtnText: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.primaryForeground, letterSpacing: 0.5 },
  });

  if (!isLoaded) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Account</Text>
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Account</Text>
        </View>
        <View style={s.signInPrompt}>
          <Ionicons name="person-circle-outline" size={72} color={colors.muted} />
          <Text style={s.signInTitle}>Sign in to view your orders</Text>
          <Text style={s.signInSub}>Track your saree orders and manage your account from one place.</Text>
          <Pressable style={s.signInBtn} onPress={() => router.push("/(auth)/sign-in")}>
            <Text style={s.signInBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`
    : user?.emailAddresses?.[0]?.emailAddress ?? "Shopper";
  const email = user?.emailAddresses?.[0]?.emailAddress ?? "";
  const imageUrl = user?.imageUrl;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Account</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchOrders(true)}
            tintColor={colors.primary}
          />
        }
      >
        <View style={s.profileCard}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={s.avatar} contentFit="cover" transition={200} />
          ) : (
            <View style={s.avatarPlaceholder}>
              <Ionicons name="person" size={26} color={colors.primary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.nameText} numberOfLines={1}>{displayName}</Text>
            {email ? <Text style={s.emailText} numberOfLines={1}>{email}</Text> : null}
          </View>
          <Pressable
            style={s.signOutBtn}
            onPress={() => signOut()}
            hitSlop={8}
          >
            <Ionicons name="log-out-outline" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <Text style={s.sectionTitle}>My Orders</Text>

        {loading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator size="large" color={colors.secondary} />
          </View>
        ) : error ? (
          <View style={{ paddingVertical: 32, alignItems: "center", paddingHorizontal: 24 }}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.mutedForeground} />
            <Text style={[s.emptyTitle, { fontSize: 18, marginTop: 12 }]}>Couldn't load orders</Text>
            <Text style={[s.emptySubtitle, { marginBottom: 16 }]}>{error}</Text>
            <Pressable onPress={() => fetchOrders()}>
              <Text style={[s.viewDetailsText, { fontSize: 14 }]}>Retry</Text>
            </Pressable>
          </View>
        ) : orders.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: "center", paddingHorizontal: 32 }}>
            <Ionicons name="bag-outline" size={56} color={colors.muted} />
            <Text style={s.emptyTitle}>No Orders Yet</Text>
            <Text style={s.emptySubtitle}>Your placed orders will appear here.</Text>
            <Pressable style={s.shopBtn} onPress={() => router.push("/(tabs)/explore")}>
              <Text style={s.shopBtnText}>Browse Sarees</Text>
            </Pressable>
          </View>
        ) : (
          orders.map((order) => {
            const sc = statusColor(order.status);
            const placedAt = new Date(order.createdAt);
            const previewImages = (order.items as OrderItem[]).slice(0, 3);
            const extra = order.items.length - 3;
            const totalItems = (order.items as OrderItem[]).reduce((s, i) => s + i.quantity, 0);

            return (
              <Pressable
                key={order.id}
                style={s.orderCard}
                onPress={() => router.push({ pathname: "/orders/[id]", params: { id: order.id, from: "history" } })}
              >
                <View style={s.orderCardInner}>
                  <View style={s.orderTopRow}>
                    <Text style={s.orderId} numberOfLines={1}>#{order.id.slice(0, 8).toUpperCase()}</Text>
                    <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                      <Ionicons name={statusIcon(order.status)} size={11} color={sc.text} />
                      <Text style={[s.statusText, { color: sc.text }]}>{order.status}</Text>
                    </View>
                  </View>

                  <View style={s.imagesRow}>
                    {previewImages.map((item, idx) => (
                      <Image
                        key={`${item.productId}-${idx}`}
                        source={{ uri: item.images?.[0] }}
                        style={s.itemThumb}
                        contentFit="cover"
                        transition={150}
                      />
                    ))}
                    {extra > 0 && (
                      <View style={s.moreThumb}>
                        <Text style={s.moreThumbText}>+{extra}</Text>
                      </View>
                    )}
                  </View>

                  <View style={s.orderBottomRow}>
                    <View>
                      <Text style={s.orderDate}>
                        {placedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                      <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
                        {totalItems} {totalItems === 1 ? "item" : "items"}
                      </Text>
                    </View>
                    <Text style={s.orderTotal}>₹{order.total.toLocaleString("en-IN")}</Text>
                  </View>
                </View>

                <View style={s.divider} />
                <View style={s.viewDetails}>
                  <Text style={s.viewDetailsText}>View Order Details</Text>
                  <Ionicons name="chevron-forward" size={13} color={colors.primary} />
                </View>
              </Pressable>
            );
          })
        )}

        <View style={{ height: Platform.OS === "web" ? 32 : insets.bottom + 100 }} />
      </ScrollView>
    </View>
  );
}
