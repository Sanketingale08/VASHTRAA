import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import ImageGalleryPicker from "@/components/seller/ImageGalleryPicker";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const CATEGORIES = ["paithani", "designer"] as const;
const FABRICS = ["silk", "cotton", "georgette", "net", "chiffon", "tissue"] as const;
const OCCASIONS = ["bridal", "festival", "casual", "party", "formal"] as const;
const COLORS_LIST = [
  "red", "maroon", "blue", "green", "yellow", "pink",
  "purple", "cream", "gold", "black", "orange", "mint",
] as const;

interface ProductVariant {
  size: string;
  color: string;
  stock: string;
  price: string;
  sku: string;
}

interface FormData {
  name: string;
  description: string;
  category: string;
  fabric: string;
  color: string;
  occasion: string;
  price: string;
  originalPrice: string;
  stock: string;
  isBestSeller: boolean;
  isNewArrival: boolean;
  images: string[];
  variants: ProductVariant[];
}

function validate(form: FormData) {
  const errors: Partial<Record<keyof FormData, string>> = {};
  if (!form.name.trim()) errors.name = "Product name is required";
  if (!form.price.trim() || isNaN(Number(form.price)) || Number(form.price) <= 0)
    errors.price = "Enter a valid price";
  if (
    form.originalPrice.trim() &&
    (isNaN(Number(form.originalPrice)) || Number(form.originalPrice) <= 0)
  )
    errors.originalPrice = "Enter a valid original price";
  if (form.stock.trim() && (isNaN(Number(form.stock)) || Number(form.stock) < 0))
    errors.stock = "Enter a valid stock quantity";
  return errors;
}

export default function SellerProductEditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [form, setForm] = useState<FormData | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    getToken().then((t) => setToken(t ?? ""));
  }, [getToken]);

  useEffect(() => {
    if (!id || !token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/products/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load product");
        const data = await res.json();
        const p = data.product ?? data;
        setForm({
          name: p.name ?? "",
          description: p.description ?? "",
          category: p.category ?? "paithani",
          fabric: p.fabric ?? "silk",
          color: p.color ?? "red",
          occasion: p.occasion ?? "festival",
          price: p.price != null ? String(p.price) : "",
          originalPrice: p.originalPrice != null ? String(p.originalPrice) : "",
          stock: p.stock != null ? String(p.stock) : "10",
          isBestSeller: p.isBestSeller ?? false,
          isNewArrival: p.isNewArrival ?? false,
          images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
          variants: Array.isArray(p.variants)
            ? p.variants.map((v: any) => ({
                size: v.size ?? "",
                color: v.color ?? "",
                stock: v.stock != null ? String(v.stock) : "",
                price: v.price != null ? String(v.price) : "",
                sku: v.sku ?? "",
              }))
            : [],
        });
      } catch (e: any) {
        setLoadError(e.message ?? "Failed to load product");
      }
    })();
  }, [id, token]);

  function update<K extends keyof FormData>(field: K, value: FormData[K]) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setApiError("");
  }

  function addVariant() {
    setForm((prev) =>
      prev ? { ...prev, variants: [...prev.variants, { size: "", color: "", stock: "", price: "", sku: "" }] } : prev
    );
  }

  function removeVariant(idx: number) {
    setForm((prev) =>
      prev ? { ...prev, variants: prev.variants.filter((_, i) => i !== idx) } : prev
    );
  }

  function updateVariant(idx: number, field: keyof ProductVariant, value: string) {
    setForm((prev) =>
      prev
        ? { ...prev, variants: prev.variants.map((v, i) => (i === idx ? { ...v, [field]: value } : v)) }
        : prev
    );
  }

  async function handleSubmit() {
    if (!form) return;
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    setApiError("");
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        fabric: form.fabric,
        color: form.color,
        occasion: form.occasion,
        price: parseInt(form.price),
        originalPrice: form.originalPrice.trim() ? parseInt(form.originalPrice) : null,
        stock: form.stock.trim() ? parseInt(form.stock) : 10,
        images: form.images.filter(Boolean),
        isBestSeller: form.isBestSeller,
        isNewArrival: form.isNewArrival,
        variants: form.variants
          .filter((v) => v.size.trim() || v.color.trim())
          .map((v) => ({
            size: v.size.trim(),
            color: v.color.trim(),
            stock: v.stock.trim() ? parseInt(v.stock) : 0,
            price: v.price.trim() ? parseInt(v.price) : null,
            sku: v.sku.trim() || null,
          })),
      };
      const res = await fetch(`${API_BASE}/api/products/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update product");
      }
      setSuccess(true);
      setTimeout(() => router.back(), 1200);
    } catch (e: any) {
      setApiError(e.message ?? "Failed to update product");
    } finally {
      setSubmitting(false);
    }
  }

  const s = makeStyles(colors, insets);

  if (loadError) {
    return (
      <View style={[s.container, { alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 }]}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.mutedForeground} />
        <Text style={[s.headerTitle, { textAlign: "center" }]}>Couldn't load product</Text>
        <Text style={{ fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
          {loadError}
        </Text>
        <Pressable style={s.submitBtn} onPress={() => router.back()}>
          <Text style={s.submitBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!form) {
    return (
      <View style={[s.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={s.headerTitle}>Edit Product</Text>
          <Text style={s.headerSub} numberOfLines={1}>{form.name || "Untitled"}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        {success && (
          <View testID="product-success-banner" style={s.successBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#22A66A" />
            <Text style={s.successText}>Changes saved!</Text>
          </View>
        )}
        {apiError ? (
          <View testID="product-error-banner" style={s.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#D93025" />
            <Text style={s.errorBannerText}>{apiError}</Text>
          </View>
        ) : null}

        <FormSection title="Images">
          <ImageGalleryPicker
            images={form.images}
            authToken={token}
            onImagesChange={(urls) => update("images", urls)}
          />
        </FormSection>

        <FormSection title="Basic Info">
          <FieldGroup label="Product Name" required error={errors.name}>
            <TextInput
              testID="product-name-input"
              style={[s.input, errors.name ? s.inputError : null]}
              placeholder="e.g. Paithani Silk Saree — Peacock Design"
              placeholderTextColor={colors.mutedForeground}
              value={form.name}
              onChangeText={(v) => update("name", v)}
              returnKeyType="next"
            />
          </FieldGroup>
          <FieldGroup label="Description">
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="Describe the product, craftsmanship, region, etc."
              placeholderTextColor={colors.mutedForeground}
              value={form.description}
              onChangeText={(v) => update("description", v)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </FieldGroup>
        </FormSection>

        <FormSection title="Classification">
          <FieldGroup label="Category">
            <ChipRow options={[...CATEGORIES]} value={form.category} onChange={(v) => update("category", v)} colors={colors} />
          </FieldGroup>
          <FieldGroup label="Fabric">
            <ChipRow options={[...FABRICS]} value={form.fabric} onChange={(v) => update("fabric", v)} colors={colors} />
          </FieldGroup>
          <FieldGroup label="Occasion">
            <ChipRow options={[...OCCASIONS]} value={form.occasion} onChange={(v) => update("occasion", v)} colors={colors} />
          </FieldGroup>
          <FieldGroup label="Primary Color">
            <ChipRow options={[...COLORS_LIST]} value={form.color} onChange={(v) => update("color", v)} colors={colors} />
          </FieldGroup>
        </FormSection>

        <FormSection title="Pricing">
          <FieldGroup label="Selling Price (₹)" required error={errors.price}>
            <TextInput
              testID="product-price-input"
              style={[s.input, errors.price ? s.inputError : null]}
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              value={form.price}
              onChangeText={(v) => update("price", v)}
              keyboardType="numeric"
              returnKeyType="next"
            />
          </FieldGroup>
          <FieldGroup label="Original Price (₹)" error={errors.originalPrice}>
            <TextInput
              style={[s.input, errors.originalPrice ? s.inputError : null]}
              placeholder="Optional — shown as crossed-out MRP"
              placeholderTextColor={colors.mutedForeground}
              value={form.originalPrice}
              onChangeText={(v) => update("originalPrice", v)}
              keyboardType="numeric"
              returnKeyType="next"
            />
          </FieldGroup>
        </FormSection>

        <FormSection title="Inventory">
          <FieldGroup label="Stock Quantity" error={errors.stock}>
            <TextInput
              style={[s.input, errors.stock ? s.inputError : null]}
              placeholder="10"
              placeholderTextColor={colors.mutedForeground}
              value={form.stock}
              onChangeText={(v) => update("stock", v)}
              keyboardType="numeric"
              returnKeyType="done"
            />
          </FieldGroup>
        </FormSection>

        <FormSection title="Variants">
          <Text style={[fss.hintText, { color: colors.mutedForeground }]}>
            Optional. Add size/color combinations with per-variant stock, price, and SKU.
          </Text>
          {form.variants.map((variant, idx) => (
            <VariantCard
              key={idx}
              variant={variant}
              index={idx}
              onChange={(field, val) => updateVariant(idx, field, val)}
              onRemove={() => removeVariant(idx)}
              colors={colors}
              inputStyle={s.input}
            />
          ))}
          <Pressable style={[fss.addVariantBtn, { borderColor: colors.primary + "55" }]} onPress={addVariant}>
            <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
            <Text style={[fss.addVariantText, { color: colors.primary }]}>Add Variant</Text>
          </Pressable>
        </FormSection>

        <FormSection title="Labels">
          <SwitchRow label="Best Seller" value={form.isBestSeller} onChange={(v) => update("isBestSeller", v)} colors={colors} />
          <SwitchRow label="New Arrival" value={form.isNewArrival} onChange={(v) => update("isNewArrival", v)} colors={colors} />
        </FormSection>

        <Pressable
          testID="product-submit-btn"
          style={[s.submitBtn, submitting && s.submitBtnDisabled]}
          onPress={submitting ? undefined : handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={s.submitBtnText}>Save Changes</Text>
          )}
        </Pressable>

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[fss.section, { backgroundColor: colors.card, borderColor: colors.border + "33" }]}>
      <Text style={[fss.sectionTitle, { color: colors.secondary }]}>{title.toUpperCase()}</Text>
      <View style={{ gap: 14 }}>{children}</View>
    </View>
  );
}

function FieldGroup({
  label, required, error, children,
}: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View>
      <Text style={[fss.label, { color: colors.mutedForeground }]}>
        {label}{required && <Text style={{ color: colors.destructive }}> *</Text>}
      </Text>
      {children}
      {error ? <Text style={fss.fieldError}>{error}</Text> : null}
    </View>
  );
}

function ChipRow({
  options, value, onChange, colors,
}: {
  options: string[]; value: string; onChange: (v: string) => void; colors: ReturnType<typeof useColors>;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
      <View style={{ flexDirection: "row", gap: 8, paddingRight: 4 }}>
        {options.map((opt) => {
          const active = value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={[fss.chip, { backgroundColor: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border + "44" }]}
            >
              <Text style={[fss.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function SwitchRow({
  label, value, onChange, colors,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={fss.switchRow}>
      <Text style={[fss.switchLabel, { color: colors.foreground }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.muted, true: colors.primary + "99" }}
        thumbColor={value ? colors.primary : colors.mutedForeground}
      />
    </View>
  );
}

function VariantCard({
  variant,
  index,
  onChange,
  onRemove,
  colors,
  inputStyle,
}: {
  variant: ProductVariant;
  index: number;
  onChange: (field: keyof ProductVariant, value: string) => void;
  onRemove: () => void;
  colors: ReturnType<typeof useColors>;
  inputStyle: object;
}) {
  return (
    <View style={[fss.variantCard, { backgroundColor: colors.muted + "55", borderColor: colors.border + "44" }]}>
      <View style={fss.variantHeader}>
        <Text style={[fss.variantLabel, { color: colors.mutedForeground }]}>Variant {index + 1}</Text>
        <Pressable onPress={onRemove} hitSlop={8} style={fss.variantRemoveBtn}>
          <Ionicons name="close-circle" size={20} color="#D93025" />
        </Pressable>
      </View>
      <View style={fss.variantRow}>
        <View style={{ flex: 1 }}>
          <Text style={[fss.variantFieldLabel, { color: colors.mutedForeground }]}>Size</Text>
          <TextInput
            style={[inputStyle, { marginTop: 4 }]}
            placeholder="e.g. 5.5m"
            placeholderTextColor={colors.mutedForeground}
            value={variant.size}
            onChangeText={(v) => onChange("size", v)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[fss.variantFieldLabel, { color: colors.mutedForeground }]}>Color</Text>
          <TextInput
            style={[inputStyle, { marginTop: 4 }]}
            placeholder="e.g. Red"
            placeholderTextColor={colors.mutedForeground}
            value={variant.color}
            onChangeText={(v) => onChange("color", v)}
          />
        </View>
      </View>
      <View style={fss.variantRow}>
        <View style={{ flex: 1 }}>
          <Text style={[fss.variantFieldLabel, { color: colors.mutedForeground }]}>Stock</Text>
          <TextInput
            style={[inputStyle, { marginTop: 4 }]}
            placeholder="0"
            placeholderTextColor={colors.mutedForeground}
            value={variant.stock}
            onChangeText={(v) => onChange("stock", v)}
            keyboardType="numeric"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[fss.variantFieldLabel, { color: colors.mutedForeground }]}>Price (₹)</Text>
          <TextInput
            style={[inputStyle, { marginTop: 4 }]}
            placeholder="Optional"
            placeholderTextColor={colors.mutedForeground}
            value={variant.price}
            onChangeText={(v) => onChange("price", v)}
            keyboardType="numeric"
          />
        </View>
      </View>
      <View>
        <Text style={[fss.variantFieldLabel, { color: colors.mutedForeground }]}>SKU</Text>
        <TextInput
          style={[inputStyle, { marginTop: 4 }]}
          placeholder="Optional — e.g. PAI-RED-55"
          placeholderTextColor={colors.mutedForeground}
          value={variant.sku}
          onChangeText={(v) => onChange("sku", v)}
          autoCapitalize="characters"
        />
      </View>
    </View>
  );
}

const fss = StyleSheet.create({
  section: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 14 },
  sectionTitle: { fontFamily: "DMSans_700Bold", fontSize: 10, letterSpacing: 1.2, marginBottom: 14 },
  label: { fontFamily: "DMSans_500Medium", fontSize: 12, marginBottom: 6 },
  fieldError: { fontFamily: "DMSans_400Regular", fontSize: 11, color: "#D93025", marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontFamily: "DMSans_500Medium", fontSize: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  switchLabel: { fontFamily: "DMSans_500Medium", fontSize: 14 },
  hintText: { fontFamily: "DMSans_400Regular", fontSize: 12, marginBottom: 4 },
  variantCard: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 10 },
  variantHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  variantLabel: { fontFamily: "DMSans_700Bold", fontSize: 12, letterSpacing: 0.4 },
  variantRemoveBtn: { padding: 2 },
  variantRow: { flexDirection: "row", gap: 10 },
  variantFieldLabel: { fontFamily: "DMSans_500Medium", fontSize: 11 },
  addVariantBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    alignSelf: "flex-start",
    marginTop: 4,
  },
  addVariantText: { fontFamily: "DMSans_700Bold", fontSize: 13 },
});

function makeStyles(colors: ReturnType<typeof useColors>, insets: { top: number }) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 20 : insets.top + 8,
      paddingBottom: 14,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + "22",
    },
    backBtn: { padding: 4 },
    headerTitle: { fontFamily: "CormorantGaramond_700Bold", fontSize: 24, color: colors.foreground },
    headerSub: { fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 1, maxWidth: 220 },
    content: { paddingHorizontal: 16, paddingTop: 16 },
    successBanner: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: "#E8F5EE", borderRadius: 10, padding: 12, marginBottom: 14,
      borderWidth: 1, borderColor: "#22A66A33",
    },
    successText: { fontFamily: "DMSans_500Medium", fontSize: 13, color: "#22A66A" },
    errorBanner: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: "#FFF0F0", borderRadius: 10, padding: 12, marginBottom: 14,
      borderWidth: 1, borderColor: "#D9302533",
    },
    errorBannerText: { fontFamily: "DMSans_400Regular", fontSize: 13, color: "#D93025", flex: 1 },
    input: {
      borderWidth: 1, borderColor: colors.border + "55", borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 11,
      fontFamily: "DMSans_400Regular", fontSize: 14, color: colors.foreground,
      backgroundColor: colors.background,
    },
    inputError: { borderColor: "#D93025" },
    textarea: { height: 90, paddingTop: 11 },
    submitBtn: {
      backgroundColor: colors.primary, borderRadius: colors.radius,
      paddingVertical: 15, alignItems: "center", justifyContent: "center", marginTop: 6,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { fontFamily: "DMSans_700Bold", fontSize: 15, color: colors.primaryForeground, letterSpacing: 0.3 },
  });
}
