import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useGetProduct } from "@workspace/api-client-react";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");
const IMAGE_H = SCREEN_W * 1.1;

function StarRating({ rating, colors }: { rating: number; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flexDirection: "row", gap: 2, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={rating >= star ? "star" : rating >= star - 0.5 ? "star-half" : "star-outline"}
          size={13}
          color={colors.gold}
        />
      ))}
    </View>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  const s = StyleSheet.create({
    row: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border + "22" },
    label: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.mutedForeground, width: 100 },
    value: { fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.foreground, flex: 1, textTransform: "capitalize" },
  });
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { addToCart, isInCart } = useCart();
  const [imgIndex, setImgIndex] = useState(0);
  const [addedToCart, setAddedToCart] = useState(false);

  const { data: product, isLoading, error } = useGetProduct(id ?? "");

  const inWishlist = product ? isInWishlist(product.id) : false;
  const inCart = product ? isInCart(product.id) : false;

  const handleWishlist = async () => {
    if (!product) return;
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await toggleWishlist(product);
  };

  const handleAddToCart = async () => {
    if (!product) return;
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await addToCart({
      productId: product.id,
      name: product.name,
      price: product.price,
      images: product.images ?? [],
      vendorName: product.vendorName,
    });
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  const handleBuyNow = () => {
    if (!product) return;
    const item = {
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      images: product.images ?? [],
      vendorName: product.vendorName,
    };
    router.push({
      pathname: "/checkout",
      params: { buyNow: encodeURIComponent(JSON.stringify(item)) },
    });
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setImgIndex(idx);
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    imageArea: { width: SCREEN_W, height: IMAGE_H, backgroundColor: colors.muted },
    image: { width: SCREEN_W, height: IMAGE_H },
    topOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: (Platform.OS === "web" ? 67 : insets.top) + 60,
    },
    backBtn: {
      position: "absolute",
      top: (Platform.OS === "web" ? 67 : insets.top) + 12,
      left: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.38)",
      alignItems: "center",
      justifyContent: "center",
    },
    wishBtn: {
      position: "absolute",
      top: (Platform.OS === "web" ? 67 : insets.top) + 12,
      right: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.38)",
      alignItems: "center",
      justifyContent: "center",
    },
    dots: {
      position: "absolute",
      bottom: 12,
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "center",
      gap: 5,
    },
    dot: { width: 6, height: 6, borderRadius: 3 },
    info: { padding: 20 },
    category: {
      fontFamily: "DMSans_500Medium",
      fontSize: 11,
      color: colors.secondary,
      letterSpacing: 2,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    name: {
      fontFamily: "CormorantGaramond_700Bold",
      fontSize: 28,
      color: colors.foreground,
      lineHeight: 34,
      marginBottom: 8,
    },
    vendor: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      color: colors.mutedForeground,
      marginBottom: 12,
    },
    ratingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
    },
    reviewCount: {
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
      color: colors.mutedForeground,
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 10,
      marginBottom: 20,
    },
    price: {
      fontFamily: "CormorantGaramond_700Bold",
      fontSize: 32,
      color: colors.primary,
    },
    originalPrice: {
      fontFamily: "DMSans_400Regular",
      fontSize: 16,
      color: colors.mutedForeground,
      textDecorationLine: "line-through",
    },
    discount: {
      fontFamily: "DMSans_500Medium",
      fontSize: 13,
      color: "#22A66A",
      backgroundColor: "#E8F5EE",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    divider: { height: 1, backgroundColor: colors.border + "33", marginBottom: 20 },
    sectionTitle: {
      fontFamily: "CormorantGaramond_600SemiBold",
      fontSize: 18,
      color: colors.foreground,
      marginBottom: 10,
    },
    description: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.foreground,
      lineHeight: 22,
      marginBottom: 20,
    },
    detailsSection: { marginBottom: 20 },
    ctaRow: {
      paddingHorizontal: 16,
      paddingBottom: Platform.OS === "web" ? 34 : (insets.bottom + 16),
      paddingTop: 12,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border + "33",
      gap: 8,
    },
    buyNowBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 14,
    },
    buyNowBtnText: {
      fontFamily: "DMSans_700Bold",
      fontSize: 15,
      color: colors.primaryForeground,
      letterSpacing: 0.5,
    },
    addCartBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 13,
    },
    addCartBtnText: {
      fontFamily: "DMSans_700Bold",
      fontSize: 15,
      color: colors.primary,
      letterSpacing: 0.5,
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { fontFamily: "DMSans_400Regular", fontSize: 15, color: colors.mutedForeground },
  });

  if (isLoading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={[s.container, s.center]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={s.errorText}>Product not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.secondary, fontFamily: "DMSans_500Medium", fontSize: 14 }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const images = product.images?.length ? product.images : [""];
  const discountPct = product.originalPrice && product.originalPrice > product.price
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : null;

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={{ position: "relative" }}>
          <FlatList
            horizontal
            pagingEnabled
            data={images}
            keyExtractor={(_, i) => String(i)}
            showsHorizontalScrollIndicator={false}
            scrollEnabled={images.length > 1}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            renderItem={({ item }) => (
              <View style={s.imageArea}>
                <Image source={{ uri: item }} style={s.image} contentFit="cover" transition={200} />
              </View>
            )}
          />
          {images.length > 1 && (
            <View style={s.dots}>
              {images.map((_: string, i: number) => (
                <View
                  key={i}
                  style={[
                    s.dot,
                    { backgroundColor: i === imgIndex ? colors.primaryForeground : "rgba(255,255,255,0.5)" },
                  ]}
                />
              ))}
            </View>
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0.5)", "transparent"]}
            style={s.topOverlay}
          />
          <Pressable onPress={() => router.back()} style={s.backBtn} testID="back-btn">
            <Ionicons name="chevron-back" size={22} color="#F4F5F7" />
          </Pressable>
          <Pressable onPress={handleWishlist} style={s.wishBtn} testID="wishlist-toggle">
            <Ionicons
              name={inWishlist ? "heart" : "heart-outline"}
              size={20}
              color={inWishlist ? "#E53935" : "#F4F5F7"}
            />
          </Pressable>
        </View>

        <View style={s.info}>
          <Text style={s.category}>{product.category}</Text>
          <Text style={s.name}>{product.name}</Text>
          <Text style={s.vendor}>by {product.vendorName}</Text>

          <View style={s.ratingRow}>
            <StarRating rating={product.reviewCount > 0 ? product.rating : 0} colors={colors} />
            <Text style={s.reviewCount}>
              {product.reviewCount > 0
                ? `${product.rating.toFixed(1)} (${product.reviewCount} customer review${product.reviewCount !== 1 ? "s" : ""})`
                : "No reviews yet"}
            </Text>
          </View>

          <View style={s.priceRow}>
            <Text style={s.price}>₹{product.price.toLocaleString("en-IN")}</Text>
            {product.originalPrice != null && product.originalPrice > product.price && (
              <Text style={s.originalPrice}>₹{product.originalPrice.toLocaleString("en-IN")}</Text>
            )}
            {discountPct != null && (
              <Text style={s.discount}>{discountPct}% off</Text>
            )}
          </View>

          <View style={s.divider} />

          <Text style={s.sectionTitle}>About this saree</Text>
          <Text style={s.description}>{product.description}</Text>

          <View style={s.detailsSection}>
            <Text style={s.sectionTitle}>Details & Specifications</Text>
            {(() => {
              const rows: Array<{ label: string; value: string }> = [];
              const addedKeys = new Set<string>();
              const addRow = (l: string, v: string | null | undefined) => {
                if (!v || typeof v !== "string" || !v.trim()) return;
                const k = l.trim().toLowerCase();
                if (addedKeys.has(k)) return;
                addedKeys.add(k);
                rows.push({ label: l.trim(), value: v.trim() });
              };
              if (Array.isArray((product as any).specifications)) {
                for (const spec of (product as any).specifications) {
                  if (spec && spec.key && spec.value) addRow(spec.key, spec.value);
                }
              }
              if (product.category) addRow("Category", product.category);
              if ((product as any).subcategory) addRow("Subcategory", (product as any).subcategory);
              if (product.fabric) addRow("Fabric", product.fabric);
              if (product.color) addRow("Color", product.color);
              if ((product as any).designPattern) addRow("Pattern", (product as any).designPattern);
              if (product.occasion) addRow("Occasion", product.occasion);
              if ((product as any).brand) addRow("Brand", (product as any).brand);
              if (product.vendorName) addRow("Seller", product.vendorName);
              if (product.stock != null) addRow("Stock", `${product.stock} available`);

              return rows.map((r) => (
                <DetailRow key={r.label} label={r.label} value={r.value} colors={colors} />
              ));
            })()}
          </View>
        </View>
      </ScrollView>

      <View style={s.ctaRow}>
        <Pressable onPress={handleBuyNow} style={s.buyNowBtn} testID="buy-now-btn">
          <Ionicons name="flash-outline" size={18} color={colors.primaryForeground} />
          <Text style={s.buyNowBtnText}>Buy Now</Text>
        </Pressable>
        <Pressable
          onPress={inCart ? () => router.push("/checkout") : handleAddToCart}
          style={[s.addCartBtn, addedToCart && { borderColor: "#22A66A" }]}
          testID="add-cart-btn"
        >
          <Ionicons
            name={addedToCart ? "checkmark-circle-outline" : inCart ? "cart" : "cart-outline"}
            size={18}
            color={addedToCart ? "#22A66A" : colors.primary}
          />
          <Text style={[s.addCartBtnText, addedToCart && { color: "#22A66A" }]}>
            {addedToCart ? "Added to Cart!" : inCart ? "Go to Checkout" : "Add to Cart"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
