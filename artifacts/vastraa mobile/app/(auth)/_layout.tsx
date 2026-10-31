import { Stack } from "expo-router";
import React from "react";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" options={{ animation: "slide_from_bottom" }} />
      <Stack.Screen name="sign-up" options={{ animation: "slide_from_bottom" }} />
    </Stack>
  );
}
