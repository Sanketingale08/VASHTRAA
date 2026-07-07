import { Ionicons } from "@expo/vector-icons";
import { useAuth, useSignUp } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

export default function SignUpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signUp, errors, fetchStatus } = useSignUp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");

  const loading = fetchStatus === "fetching";

  if (isSignedIn) {
    router.replace("/(tabs)");
    return null;
  }

  const handleSignUp = async () => {
    const { error } = await signUp.password({ emailAddress: email, password });
    if (error) return;
    if (!error) await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code: verifyCode });
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl("/");
          router.replace(url.startsWith("http") ? ("/(tabs)" as any) : (url as any));
        },
      });
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1 },
    inner: {
      flex: 1,
      paddingTop: insets.top + 20,
      paddingBottom: insets.bottom + 20,
      paddingHorizontal: 24,
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 32,
    },
    header: { marginBottom: 32 },
    title: {
      fontFamily: "CormorantGaramond_700Bold",
      fontSize: 34,
      color: colors.foreground,
      marginBottom: 6,
    },
    subtitle: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      color: colors.mutedForeground,
    },
    label: {
      fontFamily: "DMSans_500Medium",
      fontSize: 13,
      color: colors.foreground,
      marginBottom: 6,
      marginTop: 16,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.input,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border + "55",
    },
    input: {
      flex: 1,
      fontFamily: "DMSans_400Regular",
      fontSize: 15,
      color: colors.foreground,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    eyeBtn: { padding: 12 },
    errorText: {
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
      color: colors.destructive,
      marginTop: 4,
    },
    btn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 15,
      alignItems: "center",
      marginTop: 28,
    },
    btnDisabled: { opacity: 0.5 },
    btnText: {
      fontFamily: "DMSans_700Bold",
      fontSize: 15,
      color: colors.primaryForeground,
      letterSpacing: 0.5,
    },
    footer: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 20,
      gap: 4,
    },
    footerText: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      color: colors.mutedForeground,
    },
    footerLink: {
      fontFamily: "DMSans_700Bold",
      fontSize: 13,
      color: colors.secondary,
    },
    goldAccent: {
      width: 40,
      height: 3,
      backgroundColor: colors.secondary,
      borderRadius: 2,
      marginTop: 8,
    },
    captcha: { height: 0, overflow: "hidden" },
  });

  if (
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields?.includes("email_address") &&
    signUp.missingFields?.length === 0
  ) {
    return (
      <View style={s.container}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.inner}>
              <Pressable onPress={() => signUp.reset()} style={s.backBtn}>
                <Ionicons name="chevron-back" size={22} color={colors.foreground} />
              </Pressable>
              <View style={s.header}>
                <Text style={s.title}>Verify Email</Text>
                <View style={s.goldAccent} />
                <Text style={[s.subtitle, { marginTop: 8 }]}>Enter the code sent to {email}</Text>
              </View>
              <Text style={s.label}>Verification Code</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  value={verifyCode}
                  onChangeText={setVerifyCode}
                  placeholder="000000"
                  placeholderTextColor={colors.mutedForeground + "88"}
                  keyboardType="numeric"
                />
              </View>
              {errors.fields.code && <Text style={s.errorText}>{errors.fields.code.message}</Text>}
              <Pressable
                style={[s.btn, (!verifyCode || loading) && s.btnDisabled]}
                onPress={handleVerify}
                disabled={!verifyCode || loading}
              >
                {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={s.btnText}>Verify & Create Account</Text>}
              </Pressable>
              <Pressable onPress={() => signUp.verifications.sendEmailCode()} style={{ marginTop: 16, alignItems: "center" }}>
                <Text style={s.footerLink}>Resend code</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.inner}>
            <Pressable onPress={() => router.back()} style={s.backBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.foreground} />
            </Pressable>
            <View style={s.header}>
              <Text style={s.title}>Create Account</Text>
              <View style={s.goldAccent} />
              <Text style={[s.subtitle, { marginTop: 8 }]}>Join TwirlDrape to start shopping</Text>
            </View>

            <Text style={s.label}>Email Address</Text>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedForeground + "88"}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>
            {errors.fields.emailAddress && <Text style={s.errorText}>{errors.fields.emailAddress.message}</Text>}

            <Text style={s.label}>Password</Text>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Create a password"
                placeholderTextColor={colors.mutedForeground + "88"}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {errors.fields.password && <Text style={s.errorText}>{errors.fields.password.message}</Text>}

            <Pressable
              style={[s.btn, (!email || !password || loading) && s.btnDisabled]}
              onPress={handleSignUp}
              disabled={!email || !password || loading}
            >
              {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={s.btnText}>Create Account</Text>}
            </Pressable>

            <View style={s.footer}>
              <Text style={s.footerText}>Already have an account?</Text>
              <Link href="/(auth)/sign-in" asChild>
                <Pressable><Text style={s.footerLink}>Sign in</Text></Pressable>
              </Link>
            </View>

            <View nativeID="clerk-captcha" style={s.captcha} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
