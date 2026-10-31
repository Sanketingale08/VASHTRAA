import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Badge, Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { useColors } from "@/hooks/useColors";

function NativeTabLayout() {
  const { totalItems } = useCart();
  const { wishlistItems } = useWishlist();
  const totalWishlistItems = wishlistItems.length;

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <Icon sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} />
        <Label>Explore</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="wishlist">
        <Icon sf={{ default: "heart", selected: "heart.fill" }} />
        <Label>Wishlist</Label>
        <Badge hidden={totalWishlistItems === 0}>
          {totalWishlistItems > 0 ? String(totalWishlistItems) : undefined}
        </Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cart">
        <Icon sf={{ default: "bag", selected: "bag.fill" }} />
        <Label>Cart</Label>
        <Badge hidden={totalItems === 0}>
          {totalItems > 0 ? String(totalItems) : undefined}
        </Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Account</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const { totalItems } = useCart();
  const { wishlistItems } = useWishlist();
  const totalWishlistItems = wishlistItems.length;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const safeAreaInsets = useSafeAreaInsets();

  return (
    <>
      {/* Accessible cart count for E2E tests — visually hidden */}
      <Text
        testID="cart-badge-count"
        accessibilityElementsHidden
        style={{
          position: "absolute",
          opacity: 0,
          width: 0,
          height: 0,
          overflow: "hidden",
          fontSize: 1,
          pointerEvents: "none",
        }}
      >
        {String(totalItems)}
      </Text>
      {/* Accessible wishlist count for E2E tests — visually hidden */}
      <Text
        testID="wishlist-badge-count"
        accessibilityElementsHidden
        style={{
          position: "absolute",
          opacity: 0,
          width: 0,
          height: 0,
          overflow: "hidden",
          fontSize: 1,
          pointerEvents: "none",
        }}
      >
        {String(totalWishlistItems)}
      </Text>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          paddingBottom: safeAreaInsets.bottom,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Ionicons name="home-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="magnifyingglass" tintColor={color} size={24} />
            ) : (
              <Ionicons name="search-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: "Wishlist",
          tabBarBadge: totalWishlistItems > 0 ? totalWishlistItems : undefined,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="heart" tintColor={color} size={24} />
            ) : (
              <Ionicons name="heart-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarBadge: totalItems > 0 ? totalItems : undefined,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="bag" tintColor={color} size={24} />
            ) : (
              <Ionicons name="bag-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person" tintColor={color} size={24} />
            ) : (
              <Ionicons name="person-outline" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
    </>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
