import { Ionicons } from "@expo/vector-icons";
import { useAuth, useSignIn } from "@clerk/expo";
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

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signIn, errors, fetchStatus } = useSignIn();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");

  const loading = fetchStatus === "fetching";

  if (isSignedIn) {
    router.replace("/(tabs)");
    return null;
  }

  const handleSignIn = async () => {
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) return;

    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl("/");
          router.replace(url.startsWith("http") ? ("/(tabs)" as any) : (url as any));
        },
      });
    }
  };

  const handleVerify = async () => {
    await signIn.mfa.verifyEmailCode({ code: verifyCode });
    if (signIn.status === "complete") {
      await signIn.finalize({
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
    divider: { height: 1, backgroundColor: colors.border + "33", marginVertical: 20 },
    goldAccent: {
      width: 40,
      height: 3,
      backgroundColor: colors.secondary,
      borderRadius: 2,
      marginTop: 8,
    },
  });

  if (signIn.status === "needs_client_trust") {
    return (
      <View style={s.container}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <View style={s.inner}>
              <Pressable onPress={() => signIn.reset()} style={s.backBtn}>
                <Ionicons name="chevron-back" size={22} color={colors.foreground} />
              </Pressable>
              <View style={s.header}>
                <Text style={s.title}>Verify Account</Text>
                <View style={s.goldAccent} />
                <Text style={[s.subtitle, { marginTop: 8 }]}>Enter the code sent to your email</Text>
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
                {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={s.btnText}>Verify</Text>}
              </Pressable>
              <Pressable onPress={() => signIn.mfa.sendEmailCode()} style={{ marginTop: 16, alignItems: "center" }}>
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
              <Text style={s.title}>Welcome Back</Text>
              <View style={s.goldAccent} />
              <Text style={[s.subtitle, { marginTop: 8 }]}>Sign in to your VASTRAA account</Text>
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
            {errors.fields.identifier && <Text style={s.errorText}>{errors.fields.identifier.message}</Text>}

            <Text style={s.label}>Password</Text>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor={colors.mutedForeground + "88"}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {errors.fields.password && <Text style={s.errorText}>{errors.fields.password.message}</Text>}

            <Pressable
              style={[s.btn, (!email || !password || loading) && s.btnDisabled]}
              onPress={handleSignIn}
              disabled={!email || !password || loading}
            >
              {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={s.btnText}>Sign In</Text>}
            </Pressable>

            <View style={s.footer}>
              <Text style={s.footerText}>Don't have an account?</Text>
              <Link href="/(auth)/sign-up" asChild>
                <Pressable><Text style={s.footerLink}>Sign up</Text></Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
