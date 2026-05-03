import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../theme";
import type { UnsplashAttribution } from "../types/database";

// Slim shape returned by the unsplash-search edge function
interface UnsplashResult {
  id: string;
  thumb_url: string;
  small_url: string;
  regular_url: string;
  width: number;
  height: number;
  alt: string;
  photographer_name: string;
  photographer_username: string;
  photographer_url: string;
  photo_url: string;
  download_location: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called when the user picks a photo. Parent should fire the
   *  download-trigger beacon and persist the image + attribution. */
  onPick: (
    photoUrl: string,
    attribution: UnsplashAttribution,
    downloadLocation: string
  ) => void;
  /** Optional initial query (e.g. activity title) so first results are
   *  relevant without the user typing. */
  initialQuery?: string;
}

export function UnsplashPickerModal({
  visible,
  onClose,
  onPick,
  initialQuery,
}: Props) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<UnsplashResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "unsplash-search",
        { body: { action: "search", query: trimmed, per_page: 24 } }
      );
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setResults((data?.results ?? []) as UnsplashResult[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce the search by 300ms while typing
  useEffect(() => {
    if (!visible) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, visible, search]);

  // Reset query to initialQuery whenever the modal opens
  useEffect(() => {
    if (visible) {
      setQuery(initialQuery ?? "");
      setError(null);
    }
  }, [visible, initialQuery]);

  const handlePick = (r: UnsplashResult) => {
    const attribution: UnsplashAttribution = {
      photographer_name: r.photographer_name,
      photographer_username: r.photographer_username,
      photographer_url: r.photographer_url,
      photo_id: r.id,
      photo_url: r.photo_url,
      download_location: r.download_location,
    };
    onPick(r.regular_url, attribution, r.download_location);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Search photos</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Search input */}
        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Try 'sunset hike', 'coffee', 'tennis'…"
            placeholderTextColor={colors.neutral.slate}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>

        {/* Body */}
        {error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>Couldn't search Unsplash</Text>
            <Text style={styles.errorSub}>{error}</Text>
          </View>
        ) : loading && results.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary.wannaPurple} />
          </View>
        ) : results.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              {query.trim() ? "No results" : "Type to search"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={results}
            numColumns={2}
            keyExtractor={(r) => r.id}
            contentContainerStyle={styles.gridContent}
            columnWrapperStyle={{ gap: spacing.sm }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handlePick(item)}
                style={styles.tile}
              >
                <Image
                  source={{ uri: item.thumb_url }}
                  style={styles.tileImage}
                />
                <View style={styles.tileCaption}>
                  <Text style={styles.tileCredit} numberOfLines={1}>
                    {item.photographer_name}
                  </Text>
                </View>
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          />
        )}

        {/* Footer attribution */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Photos by Unsplash</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const TILE_GAP = 8;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.white },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cancel: {
    fontSize: fontSizes.body,
    color: colors.primary.wannaPurple,
    fontWeight: "600",
    width: 60,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.subhead,
    color: colors.neutral.charcoal,
  },
  searchWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  searchInput: {
    height: 44,
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  emptyText: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
  },
  errorText: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
  },
  errorSub: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  gridContent: { padding: spacing.md, gap: TILE_GAP },
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: borderRadius.md,
    overflow: "hidden",
    backgroundColor: colors.neutral.cloud,
  },
  tileImage: {
    width: "100%",
    height: "100%",
  },
  tileCaption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  tileCredit: {
    fontSize: 11,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  footer: {
    padding: spacing.sm,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.neutral.cloud,
  },
  footerText: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    fontWeight: "600",
  },
});
