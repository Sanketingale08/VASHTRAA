import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

type SellerProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
  images: string[];
  isActive: boolean;
  category: string;
};

export default function SellerProductsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getToken, isSignedIn } = useAuth();

  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchProducts = useCallback(
    async (isRefresh = false) => {
      if (!isSignedIn) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/api/seller/products`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to load products");
        }
        const data = await res.json();
        setProducts(data.products ?? []);
      } catch (e: any) {
        setError(e.message ?? "Something went wrong");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isSignedIn, getToken]
  );

  useFocusEffect(
    useCallback(() => {
      fetchProducts();
    }, [fetchProducts])
  );

  async function handleDelete(id: string, name: string) {
    Alert.alert(
      "Delete Product",
      `Remove "${name}" from your listings?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await getToken();
              const res = await fetch(`${API_BASE}/api/products/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) throw new Error("Failed to delete");
              setProducts((prev) => prev.filter((p) => p.id !== id));
            } catch {
              Alert.alert("Error", "Could not delete product. Please try again.");
            }
          },
        },
      ]
    );
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 20 : insets.top + 8,
      paddingBottom: 14,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: colors.border + "22",
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    backBtn: { padding: 4 },
    headerTitle: { fontFamily: "CormorantGaramond_700Bold", fontSize: 24, color: colors.foreground },
    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    addBtnText: { fontFamily: "DMSans_700Bold", fontSize: 13, color: colors.primaryForeground },
    card: {
      flexDirection: "row",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border + "22",
      marginHorizontal: 16,
      marginBottom: 10,
      overflow: "hidden",
    },
    thumb: { width: 80, height: 80, backgroundColor: colors.muted },
    cardBody: { flex: 1, padding: 12, justifyContent: "space-between" },
    productName: {
      fontFamily: "DMSans_700Bold",
      fontSize: 14,
      color: colors.foreground,
      lineHeight: 20,
    },
    meta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
    price: { fontFamily: "DMSans_700Bold", fontSize: 13, color: colors.secondary },
    stock: { fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.mutedForeground },
    badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: { fontFamily: "DMSans_700Bold", fontSize: 10, textTransform: "capitalize" },
    cardActions: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      justifyContent: "center",
      gap: 8,
    },
    actionBtn: {
      width: 34,
      height: 34,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
    emptyTitle: {
      fontFamily: "CormorantGaramond_700Bold",
      fontSize: 22,
      color: colors.foreground,
      marginTop: 16,
      textAlign: "center",
    },
    emptySubtitle: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 6,
      marginBottom: 20,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingHorizontal: 28,
      paddingVertical: 13,
    },
    primaryBtnText: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.primaryForeground },
    sectionLabel: {
      fontFamily: "DMSans_500Medium",
      fontSize: 11,
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 10,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={s.headerTitle}>My Products</Text>
        </View>
        <Pressable style={s.addBtn} onPress={() => router.push("/seller/product-new")}>
          <Ionicons name="add" size={16} color={colors.primaryForeground} />
          <Text style={s.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.mutedForeground} />
          <Text style={s.emptyTitle}>Couldn't load products</Text>
          <Text style={s.emptySubtitle}>{error}</Text>
          <Pressable style={s.primaryBtn} onPress={() => fetchProducts()}>
            <Text style={s.primaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchProducts(true)}
              tintColor={colors.primary}
            />
          }
        >
          {products.length === 0 ? (
            <View style={[s.center, { paddingVertical: 60 }]}>
              <Ionicons name="storefront-outline" size={56} color={colors.muted} />
              <Text style={s.emptyTitle}>No Products Yet</Text>
              <Text style={s.emptySubtitle}>Add your first saree listing to start selling on VASTRAA.</Text>
              <Pressable style={s.primaryBtn} onPress={() => router.push("/seller/product-new")}>
                <Text style={s.primaryBtnText}>Add Your First Product</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={s.sectionLabel}>{products.length} {products.length === 1 ? "listing" : "listings"}</Text>
              {products.map((product) => (
                <View key={product.id} style={s.card}>
                  <Image
                    source={{ uri: product.images?.[0] }}
                    style={s.thumb}
                    contentFit="cover"
                    transition={150}
                  />
                  <View style={s.cardBody}>
                    <Text style={s.productName} numberOfLines={2}>{product.name}</Text>
                    <View style={s.meta}>
                      <Text style={s.price}>₹{product.price?.toLocaleString("en-IN")}</Text>
                      <Text style={s.stock}>{product.stock} in stock</Text>
                      <View style={[s.badge, { backgroundColor: product.isActive ? "#E8F5EE" : "#F5F5F5" }]}>
                        <Text style={[s.badgeText, { color: product.isActive ? "#22A66A" : "#888" }]}>
                          {product.isActive ? "Active" : "Inactive"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.cardActions}>
                    <Pressable
                      style={s.actionBtn}
                      onPress={() =>
                        router.push({ pathname: "/seller/product-edit", params: { id: product.id } })
                      }
                      hitSlop={4}
                    >
                      <Ionicons name="pencil-outline" size={17} color={colors.foreground} />
                    </Pressable>
                    <Pressable
                      style={[s.actionBtn, { backgroundColor: "#FFF0F0" }]}
                      onPress={() => handleDelete(product.id, product.name)}
                      hitSlop={4}
                    >
                      <Ionicons name="trash-outline" size={17} color={colors.destructive} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </>
          )}
          <View style={{ height: Platform.OS === "web" ? 32 : insets.bottom + 40 }} />
        </ScrollView>
      )}
    </View>
  );
}
