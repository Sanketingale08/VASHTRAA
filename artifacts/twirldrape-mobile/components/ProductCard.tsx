import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import type { ProductSummary } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useWishlist } from "@/context/WishlistContext";

interface ProductCardProps {
  product: ProductSummary;
  width?: number;
  compact?: boolean;
}

export function ProductCard({ product, width, compact = false }: ProductCardProps) {
  const colors = useColors();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const inWishlist = isInWishlist(product.id);
  const heartScale = useSharedValue(1);

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const handleWishlist = useCallback(async () => {
    heartScale.value = withSpring(1.4, { damping: 6 }, () => {
      heartScale.value = withSpring(1);
    });
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await toggleWishlist(product);
  }, [product, toggleWishlist, heartScale]);

  const imageUrl = product.images?.[0] ?? "";
  const cardW = width ?? 180;

  const styles = StyleSheet.create({
    card: {
      width: cardW,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border + "33",
    },
    imageContainer: {
      width: cardW,
      height: compact ? cardW * 0.9 : cardW * 1.2,
      backgroundColor: colors.muted,
    },
    image: {
      width: "100%",
      height: "100%",
    },
    wishlistBtn: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.background + "CC",
      alignItems: "center",
      justifyContent: "center",
    },
    badge: {
      position: "absolute",
      top: 8,
      left: 8,
      backgroundColor: colors.secondary,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    badgeText: {
      color: colors.secondaryForeground,
      fontSize: 9,
      fontFamily: "DMSans_500Medium",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    info: {
      padding: compact ? 8 : 10,
    },
    name: {
      fontFamily: "CormorantGaramond_600SemiBold",
      fontSize: compact ? 13 : 15,
      color: colors.foreground,
      lineHeight: compact ? 17 : 20,
      marginBottom: 2,
    },
    vendor: {
      fontFamily: "DMSans_400Regular",
      fontSize: 11,
      color: colors.mutedForeground,
      marginBottom: 4,
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    price: {
      fontFamily: "DMSans_700Bold",
      fontSize: compact ? 13 : 15,
      color: colors.primary,
    },
    originalPrice: {
      fontFamily: "DMSans_400Regular",
      fontSize: 11,
      color: colors.mutedForeground,
      textDecorationLine: "line-through",
    },
  });

  return (
    <Pressable
      testID={`product-card-${product.id}`}
      onPress={() => router.push(`/product/${product.id}`)}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
        {(product.isBestSeller || product.isNewArrival) && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {product.isBestSeller ? "Bestseller" : "New"}
            </Text>
          </View>
        )}
        <Pressable
          testID={`wishlist-btn-${product.id}`}
          onPress={handleWishlist}
          hitSlop={8}
          style={styles.wishlistBtn}
        >
          <Animated.View style={heartStyle}>
            <Ionicons
              name={inWishlist ? "heart" : "heart-outline"}
              size={18}
              color={inWishlist ? "#E53935" : colors.foreground}
            />
          </Animated.View>
        </Pressable>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.vendor} numberOfLines={1}>{product.vendorName}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>₹{product.price.toLocaleString("en-IN")}</Text>
          {product.originalPrice != null && product.originalPrice > product.price && (
            <Text style={styles.originalPrice}>
              ₹{product.originalPrice.toLocaleString("en-IN")}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
