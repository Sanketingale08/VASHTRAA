import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { useCart } from "@/context/CartContext";
import { useColors } from "@/hooks/useColors";

export default function CartScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { items, totalItems, removeFromCart, updateQuantity, clearCart } = useCart();

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 20 : insets.top + 8,
      paddingBottom: 12,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + "22",
    },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headerTitle: { fontFamily: "CormorantGaramond_700Bold", fontSize: 26, color: colors.foreground },
    clearBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    clearBtnText: { fontFamily: "DMSans_500Medium", fontSize: 12, color: colors.destructive },
    emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
    emptyTitle: { fontFamily: "CormorantGaramond_700Bold", fontSize: 26, color: colors.foreground, marginTop: 16, textAlign: "center" },
    emptySubtitle: { fontFamily: "DMSans_400Regular", fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginTop: 8, marginBottom: 24 },
    browseBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingHorizontal: 32,
      paddingVertical: 14,
    },
    browseBtnText: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.primaryForeground, letterSpacing: 0.5 },
    content: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 160 },
    itemCard: {
      flexDirection: "row",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border + "22",
      marginBottom: 12,
      overflow: "hidden",
    },
    itemImage: { width: 90, height: 110 },
    itemInfo: { flex: 1, padding: 12, justifyContent: "space-between" },
    itemName: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.foreground, lineHeight: 18 },
    itemVendor: { fontFamily: "DMSans_400Regular", fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
    itemPrice: { fontFamily: "CormorantGaramond_700Bold", fontSize: 18, color: colors.primary, marginTop: 6 },
    qtyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
    qtyBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border + "44",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    qtyText: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.foreground, minWidth: 20, textAlign: "center" },
    removeBtn: { marginTop: 2 },
    footer: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border + "22",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: Platform.OS === "web" ? 16 : insets.bottom + 16,
    },
    summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    subtotalLabel: { fontFamily: "DMSans_400Regular", fontSize: 14, color: colors.mutedForeground },
    subtotalValue: { fontFamily: "CormorantGaramond_700Bold", fontSize: 22, color: colors.foreground },
    checkoutBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 15,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    checkoutBtnText: { fontFamily: "DMSans_700Bold", fontSize: 15, color: colors.primaryForeground, letterSpacing: 0.5 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={s.headerTitle}>
            Cart {totalItems > 0 && <Text style={{ fontSize: 18, color: colors.mutedForeground }}>({totalItems})</Text>}
          </Text>
          {items.length > 0 && (
            <Pressable onPress={clearCart} style={s.clearBtn}>
              <Text style={s.clearBtnText}>Clear All</Text>
            </Pressable>
          )}
        </View>
      </View>

      {items.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="bag-outline" size={64} color={colors.muted} />
          <Text style={s.emptyTitle}>Your Cart is Empty</Text>
          <Text style={s.emptySubtitle}>Add your favourite sarees to get started</Text>
          <Pressable style={s.browseBtn} onPress={() => router.push("/(tabs)/explore")}>
            <Text style={s.browseBtnText}>Browse Sarees</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.content}>
              {items.map((item) => (
                <View key={item.productId} style={s.itemCard}>
                  <Image
                    source={{ uri: item.images?.[0] }}
                    style={s.itemImage}
                    contentFit="cover"
                    transition={200}
                  />
                  <View style={s.itemInfo}>
                    <View>
                      <Text style={s.itemName} numberOfLines={2}>{item.name}</Text>
                      <Text style={s.itemVendor}>{item.vendorName}</Text>
                      <Text style={s.itemPrice}>₹{item.price.toLocaleString("en-IN")}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={s.qtyRow}>
                        <Pressable style={s.qtyBtn} onPress={() => updateQuantity(item.productId, item.quantity - 1)} hitSlop={8}>
                          <Ionicons name="remove" size={14} color={colors.foreground} />
                        </Pressable>
                        <Text style={s.qtyText}>{item.quantity}</Text>
                        <Pressable style={s.qtyBtn} onPress={() => updateQuantity(item.productId, item.quantity + 1)} hitSlop={8}>
                          <Ionicons name="add" size={14} color={colors.foreground} />
                        </Pressable>
                      </View>
                      <Pressable testID={`cart-remove-btn-${item.productId}`} onPress={() => removeFromCart(item.productId)} style={s.removeBtn} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={s.footer}>
            <View style={s.summaryRow}>
              <Text style={s.subtotalLabel}>Subtotal ({totalItems} items)</Text>
              <Text style={s.subtotalValue}>₹{subtotal.toLocaleString("en-IN")}</Text>
            </View>
            <Pressable style={s.checkoutBtn} onPress={() => router.push("/checkout")} testID="checkout-btn">
              <Ionicons name="bag-check-outline" size={18} color={colors.primaryForeground} />
              <Text style={s.checkoutBtnText}>Proceed to Checkout</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
