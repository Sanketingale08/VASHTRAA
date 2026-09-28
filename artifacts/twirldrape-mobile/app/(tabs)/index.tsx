import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useListProducts } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = 160;

const CategoryTile = ({
  label,
  subtitle,
  imageSource,
  onPress,
  colors,
}: {
  label: string;
  subtitle: string;
  imageSource: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) => {
  const tileW = (SCREEN_W - 48) / 2;
  return (
    <Pressable
      onPress={onPress}
      testID={`category-${label.toLowerCase()}`}
      style={({ pressed }) => [
        {
          width: tileW,
          height: tileW * 1.3,
          borderRadius: colors.radius * 2,
          overflow: "hidden",
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <Image
        source={{ uri: imageSource }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.62)"]}
        style={[StyleSheet.absoluteFill, { justifyContent: "flex-end", padding: 14 }]}
      >
        <Text
          style={{
            fontFamily: "CormorantGaramond_700Bold",
            fontSize: 20,
            color: "#F4F5F7",
            lineHeight: 24,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: "DMSans_400Regular",
            fontSize: 11,
            color: "rgba(250,246,238,0.8)",
            marginTop: 2,
          }}
        >
          {subtitle}
        </Text>
      </LinearGradient>
    </Pressable>
  );
};

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: bestSellers, refetch: refetchBS, isFetching: fetchingBS } = useListProducts(
    { sort: "rating_desc", limit: 10 },
  );
  const { data: newArrivals, refetch: refetchNA } = useListProducts(
    { sort: "newest", limit: 10 },
  );
  const { data: paithaniBanner } = useListProducts(
    { category: "paithani", limit: 1 },
  );
  const { data: designerBanner } = useListProducts(
    { category: "designer", limit: 1 },
  );

  const paithanis = paithaniBanner?.products ?? [];
  const designers = designerBanner?.products ?? [];

  const categoryPaithaniImg = paithanis[0]?.images?.[0] ?? "";
  const categoryDesignerImg = designers[0]?.images?.[0] ?? "";

  const bsProducts = bestSellers?.products ?? [];
  const naProducts = newArrivals?.products ?? [];

  const isRefreshing = fetchingBS;

  const onRefresh = () => {
    refetchBS();
    refetchNA();
  };

  const s = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: topPad + 12,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.primary,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    brand: {
      fontFamily: "CormorantGaramond_700Bold",
      fontSize: 28,
      color: colors.primaryForeground,
      letterSpacing: 1,
    },
    tagline: {
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
      color: colors.secondary,
      marginTop: 2,
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    section: {
      marginTop: 24,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    sectionTitle: {
      fontFamily: "CormorantGaramond_600SemiBold",
      fontSize: 22,
      color: colors.foreground,
    },
    seeAll: {
      fontFamily: "DMSans_500Medium",
      fontSize: 12,
      color: colors.secondary,
      letterSpacing: 0.5,
    },
    categoriesRow: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 20,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border + "33",
      marginHorizontal: 20,
      marginTop: 24,
    },
    bottomPad: {
      height: Platform.OS === "web" ? 34 : 80,
    },
    goldDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.gold,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.brandRow}>
          <View>
            <Text style={s.brand}>VASTRAA</Text>
            <Text style={s.tagline}>Luxury Indian Silks</Text>
          </View>
          <Pressable
            onPress={() => router.push("/(tabs)/explore")}
            hitSlop={8}
          >
            <Ionicons name="search-outline" size={24} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.secondary}
          />
        }
      >
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Collections</Text>
          </View>
          <View style={s.categoriesRow}>
            <CategoryTile
              label="Paithani"
              subtitle="Silk from Paithan"
              imageSource={categoryPaithaniImg}
              onPress={() => router.push({ pathname: "/(tabs)/explore", params: { category: "paithani" } })}
              colors={colors}
            />
            <CategoryTile
              label="Designer"
              subtitle="Contemporary styles"
              imageSource={categoryDesignerImg}
              onPress={() => router.push({ pathname: "/(tabs)/explore", params: { category: "designer" } })}
              colors={colors}
            />
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Best Sellers</Text>
            <Pressable onPress={() => router.push("/(tabs)/explore")}>
              <Text style={s.seeAll}>View all</Text>
            </Pressable>
          </View>
          {bsProducts.length === 0 ? (
            <ActivityIndicator color={colors.secondary} style={{ marginVertical: 20 }} />
          ) : (
            <FlatList
              horizontal
              data={bsProducts}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
              showsHorizontalScrollIndicator={false}
              scrollEnabled={bsProducts.length > 0}
              renderItem={({ item }) => (
                <ProductCard product={item} width={CARD_W} />
              )}
            />
          )}
        </View>

        <View style={s.divider} />

        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>New Arrivals</Text>
            <Pressable onPress={() => router.push("/(tabs)/explore")}>
              <Text style={s.seeAll}>View all</Text>
            </Pressable>
          </View>
          {naProducts.length === 0 ? (
            <ActivityIndicator color={colors.secondary} style={{ marginVertical: 20 }} />
          ) : (
            <FlatList
              horizontal
              data={naProducts}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
              showsHorizontalScrollIndicator={false}
              scrollEnabled={naProducts.length > 0}
              renderItem={({ item }) => (
                <ProductCard product={item} width={CARD_W} />
              )}
            />
          )}
        </View>

        <View style={s.bottomPad} />
      </ScrollView>
    </View>
  );
}
