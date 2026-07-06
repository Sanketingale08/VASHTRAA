import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Dimensions,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductCard } from "@/components/ProductCard";
import { useWishlist } from "@/context/WishlistContext";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");
const COLS = 2;
const GAP = 12;
const SIDE_PAD = 16;
const CARD_W = (SCREEN_W - SIDE_PAD * 2 - GAP) / COLS;

export default function WishlistScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { wishlistItems } = useWishlist();

  const s = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: topPad + 16,
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + "33",
    },
    title: {
      fontFamily: "CormorantGaramond_700Bold",
      fontSize: 28,
      color: colors.foreground,
    },
    subtitle: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      color: colors.mutedForeground,
      marginTop: 2,
    },
    grid: {
      paddingHorizontal: SIDE_PAD,
      paddingTop: 16,
      gap: GAP,
    },
    row: {
      flexDirection: "row",
      gap: GAP,
    },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      paddingBottom: 80,
    },
    emptyIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: {
      fontFamily: "CormorantGaramond_600SemiBold",
      fontSize: 22,
      color: colors.foreground,
    },
    emptyText: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.mutedForeground,
      textAlign: "center",
      paddingHorizontal: 40,
      lineHeight: 20,
    },
    bottomPad: {
      height: Platform.OS === "web" ? 34 : 80,
    },
  });

  const keyExtractor = (_: typeof wishlistItems[number], i: number) =>
    wishlistItems[i]?.id ?? String(i);

  const renderItem = ({ item, index }: { item: typeof wishlistItems[number]; index: number }) => {
    if (index % 2 !== 0) return null;
    const next = wishlistItems[index + 1];
    return (
      <View style={s.row}>
        <ProductCard product={item} width={CARD_W} compact />
        {next ? (
          <ProductCard product={next} width={CARD_W} compact />
        ) : (
          <View style={{ width: CARD_W }} />
        )}
      </View>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Wishlist</Text>
        {wishlistItems.length > 0 && (
          <Text style={s.subtitle}>
            {wishlistItems.length} {wishlistItems.length === 1 ? "saree" : "sarees"} saved
          </Text>
        )}
      </View>

      {wishlistItems.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIconContainer}>
            <Ionicons name="heart-outline" size={36} color={colors.mutedForeground} />
          </View>
          <Text style={s.emptyTitle}>Your wishlist is empty</Text>
          <Text style={s.emptyText}>
            Tap the heart on any saree to save it here for later
          </Text>
        </View>
      ) : (
        <FlatList
          data={wishlistItems}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={s.grid}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!wishlistItems.length}
          ListFooterComponent={<View style={s.bottomPad} />}
        />
      )}
    </View>
  );
}
