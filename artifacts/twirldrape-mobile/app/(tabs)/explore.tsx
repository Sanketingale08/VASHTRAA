import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useListProducts } from "@workspace/api-client-react";
import type { ListProductsParams } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W } = Dimensions.get("window");
const COLS = 2;
const GAP = 12;
const SIDE_PAD = 16;
const CARD_W = (SCREEN_W - SIDE_PAD * 2 - GAP) / COLS;

type Category = "all" | "paithani" | "designer";

const FILTERS: { key: Category; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paithani", label: "Paithani" },
  { key: "designer", label: "Designer" },
];

export default function ExploreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const params = useLocalSearchParams<{ category?: string }>();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>(
    (params.category as Category) ?? "all",
  );

  useEffect(() => {
    if (params.category && ["paithani", "designer"].includes(params.category)) {
      setCategory(params.category as Category);
    }
  }, [params.category]);

  const queryParams: ListProductsParams = {
    limit: 20,
    ...(category !== "all" ? { category: category as "paithani" | "designer" } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  };

  const { data, isFetching, refetch } = useListProducts(queryParams);
  const products = data?.products ?? [];

  const handleCategoryPress = useCallback((cat: Category) => {
    setCategory(cat);
  }, []);

  const s = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: topPad + 8,
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + "33",
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border + "44",
      paddingHorizontal: 12,
      height: 44,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.foreground,
      height: "100%",
    },
    filtersRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 12,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipInactive: {
      backgroundColor: "transparent",
      borderColor: colors.border,
    },
    chipText: {
      fontFamily: "DMSans_500Medium",
      fontSize: 13,
    },
    chipTextActive: {
      color: colors.primaryForeground,
    },
    chipTextInactive: {
      color: colors.mutedForeground,
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
    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 60,
      gap: 8,
    },
    emptyTitle: {
      fontFamily: "CormorantGaramond_600SemiBold",
      fontSize: 20,
      color: colors.foreground,
    },
    emptyText: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.mutedForeground,
      textAlign: "center",
      paddingHorizontal: 40,
    },
    bottomPad: {
      height: Platform.OS === "web" ? 34 : 80,
    },
    count: {
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
      color: colors.mutedForeground,
      textAlign: "right",
      paddingHorizontal: SIDE_PAD,
      marginTop: 8,
    },
  });

  const renderItem = useCallback(
    ({ item, index }: { item: typeof products[number]; index: number }) => {
      if (index % 2 !== 0) return null;
      const next = products[index + 1];
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
    },
    [products, CARD_W],
  );

  const keyExtractor = useCallback((item: typeof products[number]) => item.id, []);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.searchRow}>
          <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            style={s.searchInput}
            placeholder="Search sarees..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            testID="search-input"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filtersRow}
          contentContainerStyle={{ gap: 8 }}
        >
          {FILTERS.map((f) => {
            const active = category === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => handleCategoryPress(f.key)}
                style={[s.chip, active ? s.chipActive : s.chipInactive]}
                testID={`filter-${f.key}`}
              >
                <Text style={[s.chipText, active ? s.chipTextActive : s.chipTextInactive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isFetching && products.length === 0 ? (
        <View style={s.loading}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      ) : products.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="search-outline" size={48} color={colors.muted} />
          <Text style={s.emptyTitle}>No sarees found</Text>
          <Text style={s.emptyText}>
            Try a different search or category
          </Text>
        </View>
      ) : (
        <>
          {data?.total != null && (
            <Text style={s.count}>{data.total} results</Text>
          )}
          <FlatList
            data={products}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={s.grid}
            showsVerticalScrollIndicator={false}
            refreshing={isFetching}
            onRefresh={refetch}
            scrollEnabled={!!products.length}
            ListFooterComponent={<View style={s.bottomPad} />}
          />
        </>
      )}
    </View>
  );
}
