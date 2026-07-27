import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useColors } from "@/hooks/useColors";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface ImageEntry {
  id: string;
  uri: string;
  url: string;
  progress: number;
  uploading: boolean;
  error: string;
}

let _idCounter = 0;
function makeId() {
  return `img-${++_idCounter}`;
}

function uploadWithProgress(
  uri: string,
  mimeType: string,
  authToken: string,
  onProgress: (p: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Resolve the local URI to a Blob first so XHR always sends
    // raw binary bytes — required by express.raw() on the server.
    // fetch(uri) works for both web blob URLs and React Native file:// URIs.
    fetch(uri)
      .then((r) => r.blob())
      .then((blob) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const { publicRelPath } = JSON.parse(xhr.responseText);
              resolve(`${API_BASE}${publicRelPath}`);
            } catch {
              reject(new Error("Invalid server response"));
            }
          } else {
            let msg = `Upload failed (${xhr.status})`;
            try {
              const data = JSON.parse(xhr.responseText);
              if (data.error) msg = data.error;
            } catch {}
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.open("POST", `${API_BASE}/api/seller/upload/product-image`);
        xhr.setRequestHeader("Content-Type", mimeType);
        xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
        xhr.send(blob);
      })
      .catch((err) => reject(new Error(`Could not read image: ${err.message}`)));
  });
}

function ProgressRing({ progress, size = 44, color }: { progress: number; size?: number; color: string }) {
  const radius = (size - 6) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = circ * (progress / 100);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke="#D6C9BA" strokeWidth={3} fill="none"
      />
      <Circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke={color} strokeWidth={3} fill="none"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

interface ImageTileProps {
  entry: ImageEntry;
  index: number;
  total: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onReplace: (token: string) => void;
}

function ImageTile({ entry, index, total, onRemove, onMoveUp, onMoveDown, onReplace }: ImageTileProps) {
  const colors = useColors();
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const canInteract = Boolean(entry.url) && !entry.uploading && !entry.error;

  return (
    <View style={[s.tile, { backgroundColor: colors.beige }]}>
      {entry.uri || entry.url ? (
        <Image
          source={{ uri: entry.url || entry.uri }}
          style={s.tileImage}
          contentFit="cover"
        />
      ) : null}

      {entry.uploading && (
        <View style={[s.tileOverlay, { backgroundColor: "rgba(232,213,183,0.90)" }]}>
          <ProgressRing progress={entry.progress} color={colors.maroon} />
          <Text style={[s.progressText, { color: colors.maroon }]}>{entry.progress}%</Text>
        </View>
      )}

      {entry.error ? (
        <View style={[s.tileOverlay, { backgroundColor: "rgba(254,242,242,0.95)" }]}>
          <Ionicons name="alert-circle-outline" size={22} color="#D93025" />
          <Text style={s.errorText} numberOfLines={2}>{entry.error}</Text>
        </View>
      ) : null}

      {isFirst && canInteract && (
        <View style={[s.mainBadge, { backgroundColor: colors.maroon }]}>
          <Text style={s.mainBadgeText}>Main</Text>
        </View>
      )}

      {canInteract && (
        <View style={s.tileActions}>
          <View style={s.reorderCol}>
            <Pressable
              style={[s.reorderBtn, isFirst && s.reorderBtnDisabled]}
              onPress={isFirst ? undefined : onMoveUp}
              hitSlop={4}
            >
              <Ionicons name="chevron-up" size={14} color={isFirst ? "#ccc" : "#fff"} />
            </Pressable>
            <Pressable
              style={[s.reorderBtn, isLast && s.reorderBtnDisabled]}
              onPress={isLast ? undefined : onMoveDown}
              hitSlop={4}
            >
              <Ionicons name="chevron-down" size={14} color={isLast ? "#ccc" : "#fff"} />
            </Pressable>
          </View>
          <View style={s.actionCol}>
            <Pressable style={s.replaceBtn} onPress={() => onReplace("replace")} hitSlop={4}>
              <Ionicons name="refresh-outline" size={14} color="#fff" />
            </Pressable>
            <Pressable style={[s.removeBtn, { backgroundColor: "rgba(200,30,30,0.55)" }]} onPress={onRemove} hitSlop={4}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const TILE_SIZE = 148;

const s = StyleSheet.create({
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 12,
    overflow: "hidden",
    marginRight: 10,
    marginBottom: 10,
  },
  tileImage: {
    width: "100%",
    height: "100%",
  },
  tileOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  progressText: {
    fontSize: 12,
    fontFamily: "DMSans_700Bold",
  },
  errorText: {
    fontSize: 10,
    color: "#D93025",
    textAlign: "center",
    paddingHorizontal: 8,
    fontFamily: "DMSans_400Regular",
  },
  mainBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mainBadgeText: {
    fontSize: 9,
    fontFamily: "DMSans_700Bold",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tileActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    padding: 5,
    paddingBottom: 6,
    backgroundColor: "transparent",
  },
  reorderCol: {
    flexDirection: "column",
    gap: 3,
  },
  actionCol: {
    flexDirection: "column",
    gap: 3,
  },
  reorderBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  reorderBtnDisabled: {
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  replaceBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});

interface ImageGalleryPickerProps {
  images: string[];
  authToken: string;
  onImagesChange: (urls: string[]) => void;
}

export default function ImageGalleryPicker({ images, authToken, onImagesChange }: ImageGalleryPickerProps) {
  const colors = useColors();
  const entriesRef = useRef<ImageEntry[]>(
    images.filter(Boolean).map((url) => ({ id: makeId(), uri: url, url, progress: 100, uploading: false, error: "" }))
  );
  const [, forceRender] = useState(0);
  const rerender = () => forceRender((n) => n + 1);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  function emit(next: ImageEntry[]) {
    entriesRef.current = next;
    rerender();
    onImagesChange(next.filter((e) => e.url && !e.uploading).map((e) => e.url));
  }

  function refresh(next: ImageEntry[]) {
    entriesRef.current = next;
    rerender();
  }

  async function pickImages(replaceId?: string) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: replaceId ? false : true,
      quality: 0.9,
      exif: false,
    });

    if (result.canceled) return;

    const selected = result.assets;
    if (replaceId) {
      const asset = selected[0];
      const mimeType = asset.mimeType ?? "image/jpeg";
      refresh(entriesRef.current.map((e) =>
        e.id === replaceId ? { ...e, uri: asset.uri, url: "", progress: 0, uploading: true, error: "" } : e
      ));
      uploadWithProgress(
        asset.uri, mimeType, authTokenRef.current,
        (p) => refresh(entriesRef.current.map((e) => e.id === replaceId ? { ...e, progress: p } : e))
      )
        .then((url) => emit(entriesRef.current.map((e) => e.id === replaceId ? { ...e, url, uploading: false, progress: 100 } : e)))
        .catch((err) => {
          refresh(entriesRef.current.map((e) => e.id === replaceId ? { ...e, uploading: false, error: err.message } : e));
          setTimeout(() => refresh(entriesRef.current.map((e) => e.id === replaceId ? { ...e, error: "" } : e)), 3500);
        });
      return;
    }

    const newEntries: ImageEntry[] = selected.map((a) => ({
      id: makeId(),
      uri: a.uri,
      url: "",
      progress: 0,
      uploading: true,
      error: "",
    }));

    for (const a of selected) {
      if (a.fileSize && a.fileSize > MAX_IMAGE_BYTES) {
        const idx = selected.indexOf(a);
        newEntries[idx] = { ...newEntries[idx], uploading: false, error: "Max 10 MB per image" };
      }
    }

    refresh([...entriesRef.current, ...newEntries]);

    for (const entry of newEntries) {
      if (entry.error) {
        const id = entry.id;
        setTimeout(() => emit(entriesRef.current.filter((e) => e.id !== id)), 3000);
        continue;
      }
      const asset = selected[newEntries.indexOf(entry)];
      const mimeType = asset.mimeType ?? "image/jpeg";
      const id = entry.id;
      uploadWithProgress(
        asset.uri, mimeType, authTokenRef.current,
        (p) => refresh(entriesRef.current.map((e) => e.id === id ? { ...e, progress: p } : e))
      )
        .then((url) => emit(entriesRef.current.map((e) => e.id === id ? { ...e, url, uploading: false, progress: 100 } : e)))
        .catch((err) => {
          refresh(entriesRef.current.map((e) => e.id === id ? { ...e, uploading: false, error: err.message } : e));
          setTimeout(() => emit(entriesRef.current.filter((e) => e.id !== id)), 3500);
        });
    }
  }

  function removeEntry(id: string) {
    emit(entriesRef.current.filter((e) => e.id !== id));
  }

  function moveEntry(id: string, direction: "up" | "down") {
    const arr = [...entriesRef.current];
    const idx = arr.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= arr.length) return;
    [arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]];
    emit(arr);
  }

  const entries = entriesRef.current;
  const hasImages = entries.length > 0;

  return (
    <View>
      {!hasImages ? (
        <Pressable
          style={[
            galleryStyles.emptyZone,
            { borderColor: colors.border, backgroundColor: colors.cream },
          ]}
          onPress={() => pickImages()}
        >
          <View style={[galleryStyles.uploadIconBg, { backgroundColor: colors.maroon + "18" }]}>
            <Ionicons name="images-outline" size={28} color={colors.maroon} />
          </View>
          <Text style={[galleryStyles.emptyTitle, { color: colors.foreground }]}>Add Product Images</Text>
          <Text style={[galleryStyles.emptySubtitle, { color: colors.mutedForeground }]}>
            Pick from your camera roll — JPG, PNG, WEBP · Max 10 MB each
          </Text>
        </Pressable>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          {entries.map((entry, idx) => (
            <ImageTile
              key={entry.id}
              entry={entry}
              index={idx}
              total={entries.length}
              onRemove={() => removeEntry(entry.id)}
              onMoveUp={() => moveEntry(entry.id, "up")}
              onMoveDown={() => moveEntry(entry.id, "down")}
              onReplace={() => pickImages(entry.id)}
            />
          ))}
          <Pressable
            style={[galleryStyles.addMoreTile, { borderColor: colors.border, backgroundColor: colors.cream }]}
            onPress={() => pickImages()}
          >
            <Ionicons name="add" size={28} color={colors.mutedForeground} />
            <Text style={[galleryStyles.addMoreText, { color: colors.mutedForeground }]}>Add more</Text>
          </Pressable>
        </ScrollView>
      )}

      {hasImages && (
        <Text style={[galleryStyles.hint, { color: colors.mutedForeground }]}>
          {entries.filter((e) => e.url).length} of {entries.length} uploaded · Tap ↑↓ to reorder · First image is the main photo
        </Text>
      )}
    </View>
  );
}

const galleryStyles = StyleSheet.create({
  emptyZone: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 10,
  },
  uploadIconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 15,
  },
  emptySubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  addMoreTile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 10,
  },
  addMoreText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  hint: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
});
