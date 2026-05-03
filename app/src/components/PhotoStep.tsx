import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";
import { moderatePhoto, uploadActivityPhoto } from "../lib/photoUpload";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../theme";
import type {
  PhotoSource,
  UnsplashAttribution,
} from "../types/database";
import { UnsplashPickerModal } from "./UnsplashPickerModal";

interface PhotoState {
  url: string | null;
  source: PhotoSource | null;
  attribution: UnsplashAttribution | null;
  /** Storage path when source='upload', for cleanup on cancel. */
  uploadPath: string | null;
}

interface Props {
  /** Optional pasted link. When set + non-empty + http(s), we auto-fetch the
   *  OG image and offer it as the default. */
  link: string;
  /** Activity title/category — used to seed Unsplash search. */
  searchSeed: string;
  /** User id for upload path. */
  userId: string;
  /** is_seed flag — skips Cloud Vision moderation on uploads. */
  isSeed: boolean;
  value: PhotoState;
  onChange: (next: PhotoState) => void;
  /** Show a red border + helper text when validation fails. */
  errorText?: string;
}

export function PhotoStep({
  link,
  searchSeed,
  userId,
  isSeed,
  value,
  onChange,
  errorText,
}: Props) {
  const [unsplashOpen, setUnsplashOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const lastFetchedLink = useRef<string | null>(null);

  // Auto-fetch OG image when a link is pasted, but only the first time
  // (or when the link changes to a new non-empty URL). The user can
  // override with upload/Unsplash and we won't clobber their choice.
  useEffect(() => {
    const trimmed = link.trim();
    if (!trimmed) {
      lastFetchedLink.current = null;
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) return;
    if (lastFetchedLink.current === trimmed) return;

    // Only auto-set if the user hasn't picked something else
    if (value.source && value.source !== "link") return;

    let cancelled = false;
    setLinkLoading(true);
    lastFetchedLink.current = trimmed;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "link-preview",
          { body: { url: trimmed } }
        );
        if (cancelled) return;
        if (error || !data?.image) return;
        // Only set if user still hasn't picked something
        onChange({
          url: data.image as string,
          source: "link",
          attribution: null,
          uploadPath: null,
        });
      } finally {
        if (!cancelled) setLinkLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  const handleUpload = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow Photos access in Settings to upload an activity photo."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const { path, url } = await uploadActivityPhoto(
        result.assets[0].uri,
        userId
      );
      // Fire moderation in the background. Skipped for seed users.
      moderatePhoto(path, isSeed, "activity-photos");
      onChange({
        url,
        source: "upload",
        attribution: null,
        uploadPath: path,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Couldn't upload photo", msg);
    } finally {
      setUploading(false);
    }
  };

  const handleUnsplashPick = (
    photoUrl: string,
    attribution: UnsplashAttribution,
    downloadLocation: string
  ) => {
    // Compliance: fire the download trigger beacon (fire-and-forget).
    supabase.functions
      .invoke("unsplash-search", {
        body: { action: "trigger", download_location: downloadLocation },
      })
      .catch(() => {});
    onChange({
      url: photoUrl,
      source: "unsplash",
      attribution,
      uploadPath: null,
    });
    setUnsplashOpen(false);
  };

  const clear = () => {
    onChange({ url: null, source: null, attribution: null, uploadPath: null });
    lastFetchedLink.current = null;
  };

  const hasPhoto = !!value.url;

  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Photo</Text>
        <Text style={styles.required}>required</Text>
      </View>

      {/* Preview + change controls when a photo is set */}
      {hasPhoto && (
        <View style={styles.previewWrap}>
          <Image source={{ uri: value.url! }} style={styles.preview} />
          <View style={styles.previewOverlay}>
            <Pressable
              onPress={clear}
              style={({ pressed }) => [
                styles.overlayBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.overlayBtnText}>✕ Remove</Text>
            </Pressable>
          </View>
          {/* Show Unsplash credit inside the preview while editing — the
              poster gets visible attribution per Unsplash compliance. The
              caller is responsible for hiding it on Discover. */}
          {value.source === "unsplash" && value.attribution && (
            <View style={styles.attribution}>
              <Text style={styles.attributionText}>
                Photo by {value.attribution.photographer_name} on Unsplash
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Action buttons — render even when a photo is set, so user can swap */}
      <View style={[styles.actions, errorText ? styles.actionsError : null]}>
        <Pressable
          onPress={handleUpload}
          style={({ pressed }) => [
            styles.action,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          disabled={uploading || linkLoading}
        >
          {uploading ? (
            <ActivityIndicator color={colors.primary.wannaPurple} />
          ) : (
            <>
              <Text style={styles.actionIcon}>📷</Text>
              <Text style={styles.actionLabel}>Upload</Text>
              <Text style={styles.actionSub}>From your library</Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => setUnsplashOpen(true)}
          style={({ pressed }) => [
            styles.action,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={styles.actionIcon}>🔍</Text>
          <Text style={styles.actionLabel}>Search</Text>
          <Text style={styles.actionSub}>Find on Unsplash</Text>
        </Pressable>
      </View>

      {linkLoading && (
        <Text style={styles.helper}>Fetching preview from your link…</Text>
      )}
      {errorText ? (
        <Text style={styles.errorText}>{errorText}</Text>
      ) : !hasPhoto ? (
        <Text style={styles.helper}>
          Pick a hero photo for your activity. Paste a link above to auto-fill
          one, or pick from your library or Unsplash.
        </Text>
      ) : null}

      <UnsplashPickerModal
        visible={unsplashOpen}
        onClose={() => setUnsplashOpen(false)}
        onPick={handleUnsplashPick}
        initialQuery={searchSeed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: fontSizes.body,
    fontWeight: "600",
    color: colors.neutral.charcoal,
  },
  required: {
    fontSize: fontSizes.caption,
    color: colors.primary.wannaPurple,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  previewWrap: {
    aspectRatio: 3 / 2,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
    backgroundColor: colors.neutral.cloud,
    marginBottom: spacing.sm,
  },
  preview: {
    width: "100%",
    height: "100%",
  },
  previewOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  overlayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 9999,
  },
  overlayBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  attribution: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  attributionText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionsError: {
    borderWidth: 1.5,
    borderColor: "#E53E3E",
    borderRadius: borderRadius.md,
    padding: 4,
  },
  action: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 96,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  actionLabel: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    fontWeight: "700",
  },
  actionSub: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginTop: 2,
  },
  helper: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginTop: spacing.xs,
  },
  errorText: {
    fontSize: fontSizes.caption,
    color: "#E53E3E",
    marginTop: spacing.xs,
  },
});
