import { Stack } from "expo-router";

export default function SellerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="products" options={{ headerShown: false }} />
      <Stack.Screen name="product-new" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="product-edit" options={{ headerShown: false, animation: "slide_from_right" }} />
    </Stack>
  );
}
