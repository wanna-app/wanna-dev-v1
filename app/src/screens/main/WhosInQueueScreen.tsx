import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { MatchModal } from "../../components/MatchModal";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { track } from "../../lib/analytics";
import { resolveProfilePhotoUrl } from "../../lib/storage";
import type { InterestedUser } from "../../types/whosin";
import { colors, spacing, fontSizes, fonts, shadows } from "../../theme";

interface RouteParams {
  activityId: string;
  title: string;
  hasActiveMatch: boolean;
  matchId: string | null;
}

const MODE_DOT_COLOR: Record<string, string> = {
  friends: "#8C52FF",
  dating: "#FF5C7A",
  networking: "#1E90FF",
};

export function WhosInQueueScreen({ navigation, route }: any) {
  const { activityId, title } = route.params as RouteParams;
  const [hasActiveMatch, setHasActiveMatch] = useState<boolean>(
    route.params.hasActiveMatch
  );
  const [matchId, setMatchId] = useState<string | null>(route.params.matchId);
  const { profile } = useAuth();
  const [batch, setBatch] = useState<InterestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchedInfo, setMatchedInfo] = useState<{
    name: string;
    photo: string | null;
    userId: string;
    verified: boolean;
  } | null>(null);
  const [activityPhotoUrl, setActivityPhotoUrl] = useState<string | null>(null);
  // We show at most 5 interested users at a time. Once the poster
  // passes/accepts on each row in the visible window, the next 5
  // queue up automatically (loadBatch refresh on focus, plus a small
  // local windowing trick). The "{N} interested" header always
  // reflects the TRUE total — only the rendered list is capped.
  const VISIBLE_LIMIT = 5;

  // Fetch the activity's hero photo once so the MatchModal can use it.
  useEffect(() => {
    supabase
      .from("activities")
      .select("photo_url")
      .eq("id", activityId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.photo_url) setActivityPhotoUrl(data.photo_url);
      });
  }, [activityId]);

  const loadBatch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_interest_queue_batch", {
      p_activity_id: activityId,
      p_limit: 50,
    });
    if (error) {
      console.warn("get_interest_queue_batch error:", error.message);
      setLoading(false);
      return;
    }
    setBatch((data ?? []) as InterestedUser[]);
    setLoading(false);

    track("interest_queue_opened", {
      activity_id: activityId,
      queue_size: data?.length ?? 0,
      unreviewed_count: data?.length ?? 0,
    });
  }, [activityId]);

  useEffect(() => {
    loadBatch();
  }, [loadBatch]);

  // Refresh the queue whenever this screen comes back into focus —
  // handles the case where UserProfileScreen accepted/rejected an entry
  // and popped back here.
  useFocusEffect(
    useCallback(() => {
      loadBatch();
    }, [loadBatch])
  );

  const handleUnmatch = async () => {
    if (!matchId) return;
    Alert.alert(
      "Unmatch?",
      `Are you sure you want to unmatch this person for ${title}? Your chat will close and you will no longer be able to message them.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unmatch",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("unmatch", {
              p_match_id: matchId,
            });
            if (error) {
              Alert.alert("Couldn't unmatch", error.message);
              return;
            }
            track("queue_unlocked", {
              activity_id: activityId,
              match_id: matchId,
              unlock_reason: "poster_unmatch",
            });
            setHasActiveMatch(false);
            setMatchId(null);
            await loadBatch();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Icon name="CaretLeft" size={22} color={colors.neutral.charcoal} weight="bold" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Who's in</Text>
        </View>
        {hasActiveMatch && matchId ? (
          <Pressable onPress={handleUnmatch} hitSlop={8}>
            <Text style={styles.unmatchText}>Unmatch</Text>
          </Pressable>
        ) : !hasActiveMatch && batch.length > 0 ? (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{batch.length} interested</Text>
          </View>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Pinned activity banner — tap to open ActivityDetail. Open
          state uses the brand gradient; matched state drops the
          gradient for a neutral card so the screen reads "calm,
          locked" instead of "celebratory". */}
      {(!hasActiveMatch && batch.length > 0) || hasActiveMatch ? (
        <Pressable
          onPress={() => navigation.navigate("ActivityDetail", { activityId })}
        >
          {hasActiveMatch ? (
            <View style={[styles.pinnedActivity, styles.pinnedActivityNeutral]}>
              <View style={styles.pinnedIcon}>
                {activityPhotoUrl ? (
                  <Image
                    source={{ uri: activityPhotoUrl }}
                    style={styles.pinnedThumb}
                    resizeMode="cover"
                  />
                ) : (
                  <Icon
                    name="HandWaving"
                    size={24}
                    color={colors.primary.wannaPurple}
                    weight="fill"
                  />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.pinnedTitleNeutral} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.pinnedSubNeutral} numberOfLines={1}>
                  Matched
                </Text>
              </View>
              <Icon
                name="CaretRight"
                size={14}
                color={colors.neutral.slate}
                weight="bold"
              />
            </View>
          ) : (
            <LinearGradient
              colors={[colors.primary.wannaPurple, colors.secondary.wannaCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.pinnedActivity}
            >
              <View style={styles.pinnedIcon}>
                {activityPhotoUrl ? (
                  <Image
                    source={{ uri: activityPhotoUrl }}
                    style={styles.pinnedThumb}
                    resizeMode="cover"
                  />
                ) : (
                  <Icon
                    name="HandWaving"
                    size={24}
                    color="#FFFFFF"
                    weight="fill"
                  />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.pinnedTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.pinnedSub} numberOfLines={1}>
                  {batch.length} interested
                </Text>
              </View>
              <Icon
                name="CaretRight"
                size={14}
                color="rgba(255,255,255,0.85)"
                weight="bold"
              />
            </LinearGradient>
          )}
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary.wannaPurple} />
        </View>
      ) : hasActiveMatch ? (
        <View style={styles.lockedState}>
          <Text style={styles.lockedEmoji}>🔒</Text>
          <Text style={styles.lockedTitle}>
            You already have a match for this activity
          </Text>
          <Text style={styles.lockedSubtitle}>
            Unmatch to open the queue back up.
          </Text>
          <Button
            label="Open chat"
            variant="gradient"
            onPress={async () => {
              if (!matchId) {
                navigation.navigate("Matches" as never);
                return;
              }
              // Resolve the other party for this match so we can
              // navigate straight to the right chat thread. Two
              // simple selects beat a fragile FK-aliased join — the
              // previous implementation crashed on render because the
              // FK constraint names differed from what we assumed.
              const { data: me } = await supabase.auth.getUser();
              const { data: match } = await supabase
                .from("matches")
                .select("poster_id, interested_id")
                .eq("id", matchId)
                .maybeSingle();
              if (!match || !me?.user) {
                navigation.navigate("Matches" as never);
                return;
              }
              const otherUserId =
                match.poster_id === me.user.id
                  ? match.interested_id
                  : match.poster_id;
              const { data: otherProfile } = await supabase
                .from("profiles")
                .select("first_name, photos, is_verified")
                .eq("id", otherUserId)
                .maybeSingle();
              navigation.getParent()?.navigate("Matches", {
                screen: "Chat",
                params: {
                  otherUserId,
                  otherUserName: otherProfile?.first_name ?? "",
                  otherUserPhoto: otherProfile?.photos?.[0] ?? null,
                  otherUserVerified: otherProfile?.is_verified ?? false,
                },
              });
            }}
            style={{ marginTop: spacing.lg, alignSelf: "stretch" }}
          />
        </View>
      ) : batch.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🎯</Text>
          <Text style={styles.emptyTitle}>Queue empty</Text>
          <Text style={styles.emptySubtitle}>
            New people who swipe right on this activity will show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={batch.slice(0, VISIBLE_LIMIT)}
          keyExtractor={(item) => item.queue_id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListFooterComponent={
            batch.length > VISIBLE_LIMIT ? (
              <Text style={styles.showingFootnote}>
                Showing {VISIBLE_LIMIT}/{batch.length} interested
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <InterestedRow
              user={item}
              onPress={() =>
                navigation.navigate("UserProfile", {
                  userId: item.user_id,
                  queueContext: {
                    queueId: item.queue_id,
                    activityId,
                    activityTitle: title,
                    posterFirstName: profile?.first_name ?? "You",
                    posterPhoto: item.photos[0] ?? null,
                    posterIsVerified: item.is_verified,
                    firstMessage: item.first_message,
                  },
                })
              }
            />
          )}
        />
      )}

      <MatchModal
        visible={!!matchedInfo}
        matchedName={matchedInfo?.name ?? ""}
        matchedPhoto={matchedInfo?.photo ?? null}
        activityPhotoUrl={activityPhotoUrl}
        activityTitle={title}
        yourName={profile?.first_name ?? "You"}
        onSayHi={() => {
          const info = matchedInfo;
          setMatchedInfo(null);
          if (!info) return;
          navigation.getParent()?.navigate("Matches", {
            screen: "Chat",
            params: {
              otherUserId: info.userId,
              otherUserName: info.name,
              otherUserPhoto: info.photo,
              otherUserVerified: info.verified,
            },
          });
        }}
        onKeepBrowsing={() => setMatchedInfo(null)}
      />

    </SafeAreaView>
  );
}

// ─── List row ────────────────────────────────────────────────────────

function InterestedRow({
  user,
  onPress,
}: {
  user: InterestedUser;
  onPress: () => void;
}) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveProfilePhotoUrl(user.photos[0] ?? null).then((url) => {
      if (!cancelled) setAvatarUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [user.photos]);

  // Mode pill — replaces the previous distance pill so the poster
  // sees at a glance which mode each interested user was swiping in.
  // Color matches the global friends/dating/networking palette.
  const modeColor =
    user.swiper_mode && MODE_DOT_COLOR[user.swiper_mode]
      ? MODE_DOT_COLOR[user.swiper_mode]
      : null;
  const modeLabel = user.swiper_mode
    ? user.swiper_mode === "dating"
      ? "Dates"
      : user.swiper_mode === "networking"
      ? "Networking"
      : "Friends"
    : null;

  const hasMessage =
    user.first_message != null && user.first_message.trim().length > 0;

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.avatarWrap}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Icon name="User" size={22} color="#FFFFFF" weight="bold" />
          </View>
        )}
      </View>
      <View style={styles.rowMain}>
        <View style={styles.nameRow}>
          <Text style={styles.nameText} numberOfLines={1}>
            {user.first_name}
            {user.age ? `, ${user.age}` : ""}
          </Text>
          {user.is_verified && (
            <Icon
              name="SealCheck"
              size={14}
              color={colors.primary.wannaPurple}
              weight="fill"
            />
          )}
        </View>
        {hasMessage ? (
          <Text style={styles.messagePreview} numberOfLines={2}>
            {user.first_message}
          </Text>
        ) : (
          <Text style={styles.messageHint} numberOfLines={1}>
            Tap to see profile
          </Text>
        )}
      </View>
      {modeColor && modeLabel && (
        <View
          style={[
            styles.modePill,
            { backgroundColor: modeColor },
          ]}
        >
          <Text style={[styles.modePillText, { color: "#FFFFFF" }]}>
            {modeLabel}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.subtle,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1 },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.neutral.charcoal,
    fontWeight: "700",
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: "rgba(140,82,255,0.1)",
  },
  countBadgeText: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 13,
    color: colors.primary.wannaPurple,
  },
  unmatchText: {
    fontSize: fontSizes.body,
    color: "#E53E3E",
    fontWeight: "600",
    paddingHorizontal: spacing.sm,
  },

  // Pinned activity card
  pinnedActivity: {
    margin: spacing.md,
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...shadows.brand,
  },
  pinnedIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pinnedThumb: { width: "100%", height: "100%" },
  pinnedTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  pinnedSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.92)",
    marginTop: 2,
  },
  // Neutral variant used in the matched/locked state. Hairline
  // border + soft shadow tether the card so it doesn't float in
  // empty space the way the borderless gradient version did.
  pinnedActivityNeutral: {
    backgroundColor: colors.neutral.white,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pinnedTitleNeutral: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.neutral.charcoal,
    fontWeight: "700",
  },
  pinnedSubNeutral: {
    fontSize: 11,
    color: colors.neutral.slate,
    marginTop: 2,
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 22,
  },
  lockedState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  lockedEmoji: { fontSize: 56, marginBottom: spacing.md },
  lockedTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  lockedSubtitle: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    textAlign: "center",
  },

  // List
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: 4,
    paddingBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    gap: 12,
    ...shadows.sm,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
  },
  avatar: { width: "100%", height: "100%" },
  avatarFallback: {
    backgroundColor: colors.primary.wannaPurple,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMain: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  nameText: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: "700",
    color: colors.neutral.charcoal,
  },
  messagePreview: {
    fontSize: 13,
    fontStyle: "italic",
    color: colors.neutral.slate,
    marginTop: 2,
    lineHeight: 18,
  },
  messageHint: {
    fontSize: 12,
    color: colors.fg.secondary,
    marginTop: 2,
  },
  // Mode pill (Friends / Dates / Networking) on the right side of
  // each row. Filled in the mode color with white text — pops out
  // against the white card background.
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  modePillText: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: "700",
  },
  showingFootnote: {
    textAlign: "center",
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    paddingTop: spacing.lg,
  },
});
