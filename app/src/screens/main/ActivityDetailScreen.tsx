import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Avatar } from "../../components/Avatar";
import { CategoryPill } from "../../components/CategoryPill";
import { FirstMessageModal } from "../../components/FirstMessageModal";
import { Icon } from "../../components/Icon";
import { LinkPreview } from "../../components/LinkPreview";
import { ReportSheet } from "../../components/ReportSheet";
import { addActivityToCalendar } from "../../lib/icsCalendar";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { sendInterestEmail } from "../../lib/email";
import { sendPush } from "../../lib/push";
import { resolveProfilePhotoUrl } from "../../lib/storage";
import { track } from "../../lib/analytics";
import type { Activity } from "../../types/database";
import {
  categoryGradients,
  colors,
  fonts,
  fontSizes,
  shadows,
  spacing,
} from "../../theme";

interface RouteParams {
  activityId: string;
}

interface PosterMini {
  id: string;
  first_name: string;
  date_of_birth: string;
  is_verified: boolean;
  photos: string[];
}

/**
 * Activity card detail. Full-bleed hero photo with floating chrome,
 * matching the Discover expanded card layout. Two presentation modes
 * branched on ownership:
 *
 *   - Owner viewing their own activity → "Edit activity" button at
 *     the bottom (read-only fields above; edit is on the roadmap).
 *   - Non-owner → "I'm in" / Pass swipe affordance (mirrors Discover)
 *     plus a tappable "Posted by …" host card. After swiping right
 *     we open the same FirstMessageModal Discover uses so the
 *     interested user can attach a one-line note.
 *
 * Owners don't see the flag icon (can't report your own activity);
 * non-owners get a flag in the top-right that opens the report sheet.
 */
export function ActivityDetailScreen({ navigation, route }: any) {
  const { activityId } = route.params as RouteParams;
  const { user, profile: viewerProfile } = useAuth();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [poster, setPoster] = useState<PosterMini | null>(null);
  const [posterPhotoUrl, setPosterPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [alreadyExpressed, setAlreadyExpressed] = useState(false);
  // True iff the viewer (non-owner) already has an active match with the
  // poster ON THIS activity. Drives the "Add to calendar" pill — no
  // match means the user can't add an activity they haven't matched on.
  const [hasActiveMatchOnThisActivity, setHasActiveMatchOnThisActivity] =
    useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [firstMessagePrompt, setFirstMessagePrompt] = useState<{
    activityId: string;
    activityTitle: string;
    posterName: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("activities")
        .select(
          "id,user_id,title,description,category,intent,intents,location_lat,location_lng,location_name,activity_date,link,photo_url,photo_source,photo_attribution,is_seed,status,created_at,updated_at"
        )
        .eq("id", activityId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setActivity(null);
        setLoading(false);
        return;
      }
      setActivity(data as Activity);
      if (user && data.user_id !== user.id) {
        const { data: p } = await supabase
          .from("profiles")
          .select("id, first_name, date_of_birth, is_verified, photos")
          .eq("id", data.user_id)
          .maybeSingle();
        if (!cancelled && p) {
          setPoster(p as PosterMini);
          if (p.photos?.[0]) {
            resolveProfilePhotoUrl(p.photos[0]).then((url) => {
              if (!cancelled) setPosterPhotoUrl(url);
            });
          }
        }
        const { data: prev } = await supabase
          .from("swipes")
          .select("id, direction")
          .eq("swiper_id", user.id)
          .eq("activity_id", data.id)
          .maybeSingle();
        if (!cancelled && prev) setAlreadyExpressed(true);

        // Look up an active match between viewer and poster scoped to
        // THIS activity. Two-arm OR covers both directions (viewer
        // could be poster or interested party of the match row).
        const { data: matchRow } = await supabase
          .from("matches")
          .select("id")
          .eq("activity_id", data.id)
          .eq("status", "active")
          .or(
            `and(poster_id.eq.${user.id},interested_id.eq.${data.user_id}),` +
              `and(poster_id.eq.${data.user_id},interested_id.eq.${user.id})`
          )
          .maybeSingle();
        if (!cancelled) setHasActiveMatchOnThisActivity(!!matchRow?.id);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activityId, user]);

  const isOwner = !!(user && activity && activity.user_id === user.id);

  const handleEdit = () => {
    Alert.alert("Coming soon", "Edit posted activity is on the roadmap");
  };

  const handlePass = async () => {
    if (!user || !activity || actionPending) return;
    setActionPending(true);
    const { error } = await supabase.from("swipes").insert({
      swiper_id: user.id,
      activity_id: activity.id,
      activity_owner_id: activity.user_id,
      direction: "pass",
      swiper_mode: null,
    });
    setActionPending(false);
    if (error && !error.message.includes("duplicate")) {
      Alert.alert("Couldn't pass", error.message);
      return;
    }
    track("swipe", {
      activity_id: activity.id,
      direction: "pass",
      surface: "activity_detail",
    });
    navigation.goBack();
  };

  const handleAccept = async () => {
    if (!user || !activity || actionPending) return;
    setActionPending(true);
    const { error: swipeError } = await supabase.from("swipes").insert({
      swiper_id: user.id,
      activity_id: activity.id,
      activity_owner_id: activity.user_id,
      direction: "like",
      swiper_mode: null,
    });
    if (swipeError && !swipeError.message.includes("duplicate")) {
      setActionPending(false);
      Alert.alert("Couldn't express interest", swipeError.message);
      return;
    }
    const { error: queueError } = await supabase.from("interest_queue").insert({
      activity_id: activity.id,
      interested_user_id: user.id,
      swiper_mode: null,
    });
    setActionPending(false);
    if (queueError && !queueError.message.includes("duplicate")) {
      Alert.alert("Couldn't express interest", queueError.message);
      return;
    }
    track("interest_expressed", {
      activity_id: activity.id,
      interested_user_id: user.id,
      surface: "activity_detail",
    });
    // Per-type notification prefs (`notify_interest_push` /
    // `notify_interest_email`) are gated server-side in the send-push and
    // send-email edge functions, so the calls below stay unconditional.
    sendPush({
      type: "interest",
      activity_id: activity.id,
      poster_id: activity.user_id,
      interested_user_name: viewerProfile?.first_name ?? "Someone",
      activity_title: activity.title,
    }).catch(() => {});
    sendInterestEmail({
      recipient_id: activity.user_id,
      activity_id: activity.id,
    }).catch(() => {});
    setFirstMessagePrompt({
      activityId: activity.id,
      activityTitle: activity.title,
      posterName: poster?.first_name ?? "the host",
    });
  };

  const handleFirstMessageSubmit = async (message: string) => {
    const promptActivityId = firstMessagePrompt?.activityId;
    setFirstMessagePrompt(null);
    if (!promptActivityId || !user) {
      navigation.goBack();
      return;
    }
    const { error } = await supabase
      .from("interest_queue")
      .update({ first_message: message })
      .eq("activity_id", promptActivityId)
      .eq("interested_user_id", user.id);
    if (error) {
      console.warn("first_message update error:", error.message);
    } else {
      track("first_message_sent", {
        activity_id: promptActivityId,
        length: message.length,
      });
    }
    navigation.goBack();
  };

  const formattedDateMain = activity?.activity_date
    ? new Date(activity.activity_date + "T00:00:00").toLocaleDateString(
        undefined,
        { weekday: "long" }
      )
    : null;
  const formattedDateSub = activity?.activity_date
    ? new Date(activity.activity_date + "T00:00:00").toLocaleDateString(
        undefined,
        { month: "short", day: "numeric" }
      )
    : null;

  const fallbackGradient = (activity
    ? categoryGradients[activity.category] ?? [
        colors.primary.softViolet,
        colors.primary.wannaPurple,
        colors.secondary.wannaCyan,
      ]
    : [colors.primary.wannaPurple, colors.secondary.wannaCyan]) as unknown as readonly [string, string, ...string[]];

  const posterAge = poster
    ? Math.floor(
        (Date.now() - new Date(poster.date_of_birth).getTime()) /
          (1000 * 60 * 60 * 24 * 365.25)
      )
    : null;

  const distanceLabel = (() => {
    if (!activity || !viewerProfile) return null;
    const lat1 = viewerProfile.location_lat;
    const lng1 = viewerProfile.location_lng;
    const lat2 = activity.location_lat;
    const lng2 = activity.location_lng;
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
    const R = 3958.8; // miles
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const d = 2 * R * Math.asin(Math.sqrt(a));
    return d < 1 ? "<1 mi away" : `${Math.round(d)} mi away`;
  })();

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary.wannaPurple} />
      </View>
    );
  }
  if (!activity) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.empty}>Activity not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO — full-bleed photo with floating chrome + overlaid
            category pill + title (mirrors the Discover expanded card). */}
        <View style={styles.heroWrap}>
          {activity.photo_url ? (
            <Image
              source={{ uri: activity.photo_url }}
              style={styles.hero}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient colors={fallbackGradient} style={styles.hero} />
          )}
          {/* Top scrim — keeps the chrome legible over busy photos */}
          <LinearGradient
            colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]}
            locations={[0, 0.4]}
            style={[StyleSheet.absoluteFill, { height: 200 }]}
            pointerEvents="none"
          />
          {/* Bottom scrim — title legibility */}
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
            locations={[0.45, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <SafeAreaView edges={["top"]} style={styles.heroChromeSafe}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.chromeBtn}
              hitSlop={8}
            >
              <Icon
                name="CaretLeft"
                size={20}
                color={colors.neutral.charcoal}
                weight="bold"
              />
            </Pressable>
            {!isOwner ? (
              <Pressable
                onPress={() => setReportOpen(true)}
                style={styles.chromeBtn}
                hitSlop={8}
              >
                <Icon
                  name="Flag"
                  size={18}
                  color={colors.neutral.charcoal}
                  weight="bold"
                />
              </Pressable>
            ) : (
              <View style={{ width: 36, height: 36 }} />
            )}
          </SafeAreaView>

          <View style={styles.heroBottom}>
            <CategoryPill
              category={activity.category}
              variant="light"
              size="md"
              style={{ marginBottom: 12 }}
            />
            <Text style={styles.heroTitle} numberOfLines={3}>
              {activity.title}
            </Text>
          </View>
        </View>

        {/* WHEN / WHERE 2-tile grid. Each tile is omitted if its data
            is missing — for evergreen activities (no date) the WHEN
            tile is hidden entirely rather than reading "Anytime /
            Evergreen". */}
        {(formattedDateMain || activity.location_name) && (
          <View style={styles.tileRow}>
            {formattedDateMain && (
              <View style={styles.tile}>
                <View style={styles.tileLabelRow}>
                  <Icon
                    name="CalendarBlank"
                    size={13}
                    color={colors.primary.wannaPurple}
                    weight="bold"
                  />
                  <Text style={styles.tileLabel}>WHEN</Text>
                </View>
                <Text style={styles.tileMain}>{formattedDateMain}</Text>
                {formattedDateSub && (
                  <Text style={styles.tileSub}>{formattedDateSub}</Text>
                )}
              </View>
            )}
            {activity.location_name && (
              <View style={styles.tile}>
                <View style={styles.tileLabelRow}>
                  <Icon
                    name="MapPin"
                    size={13}
                    color={colors.primary.wannaPurple}
                    weight="bold"
                  />
                  <Text style={styles.tileLabel}>WHERE</Text>
                </View>
                <Text style={styles.tileMain} numberOfLines={1}>
                  {activity.location_name}
                </Text>
                {distanceLabel && (
                  <Text style={styles.tileSub}>{distanceLabel}</Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Description */}
        {activity.description ? (
          <View style={styles.bodyBlock}>
            <Text style={styles.descText}>{activity.description}</Text>
          </View>
        ) : null}

        {/* Link — same preview component as Discover/chat for parity. */}
        {activity.link ? (
          <View style={styles.bodyBlock}>
            <LinkPreview text={activity.link} variant="card" />
          </View>
        ) : null}

        {/* Add-to-calendar pill — only meaningful once viewer + poster
            have an active match on this activity. Skipping the affordance
            for non-matched users avoids polluting their calendar with
            activities they may never attend. */}
        {!isOwner && hasActiveMatchOnThisActivity && (
          <View style={styles.bodyBlock}>
            <Pressable
              style={styles.calendarPill}
              onPress={() =>
                addActivityToCalendar({
                  id: activity.id,
                  title: activity.title,
                  description: activity.description,
                  location_name: activity.location_name,
                  activity_date: activity.activity_date,
                })
              }
            >
              <Icon
                name="CalendarPlus"
                size={16}
                color={colors.primary.wannaPurple}
                weight="bold"
              />
              <Text style={styles.calendarPillLabel}>Add to calendar</Text>
            </Pressable>
          </View>
        )}

        {/* Posted by — non-owner only, tappable to open the host's
            profile. Mirrors the Discover expanded card pattern. */}
        {!isOwner && poster && (
          <View style={styles.bodyBlock}>
            <Pressable
              style={styles.posterCard}
              onPress={() =>
                navigation.navigate("UserProfile", { userId: poster.id })
              }
            >
              <Text style={styles.posterEyebrow}>POSTED BY</Text>
              <View style={styles.posterRow}>
                <Avatar
                  name={poster.first_name}
                  uri={posterPhotoUrl}
                  size={44}
                />
                <View style={styles.posterTextCol}>
                  <View style={styles.posterNameRow}>
                    <Text style={styles.posterName}>
                      {poster.first_name}
                      {posterAge !== null ? `, ${posterAge}` : ""}
                    </Text>
                    {poster.is_verified && (
                      <Icon
                        name="SealCheck"
                        size={16}
                        color={colors.primary.wannaPurple}
                        weight="fill"
                      />
                    )}
                  </View>
                </View>
                <Icon
                  name="CaretRight"
                  size={16}
                  color={colors.neutral.slate}
                  weight="bold"
                />
              </View>
            </Pressable>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky bottom bar — owner gets Edit, non-owner gets Pass + I'm in */}
      {isOwner ? (
        <SafeAreaView edges={["bottom"]} style={styles.bottomSafe}>
          <View style={styles.ownerFooter}>
            <Pressable style={styles.editBtn} onPress={handleEdit}>
              <Icon
                name="PencilSimple"
                size={16}
                color={colors.primary.wannaPurple}
                weight="bold"
              />
              <Text style={styles.editLabel}>Edit activity</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : !alreadyExpressed ? (
        <SafeAreaView edges={["bottom"]} style={styles.bottomSafe}>
          <View style={styles.swipeFooter}>
            <Pressable
              style={styles.passDisc}
              onPress={handlePass}
              disabled={actionPending}
            >
              <Icon
                name="X"
                size={20}
                color={colors.neutral.charcoal}
                weight="bold"
              />
            </Pressable>
            <Pressable
              style={styles.imInBtnOuter}
              onPress={handleAccept}
              disabled={actionPending}
            >
              <LinearGradient
                colors={[colors.primary.wannaPurple, colors.secondary.wannaCyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.imInBtn}
              >
                <Icon
                  name="HandWaving"
                  size={18}
                  color="#FFFFFF"
                  weight="fill"
                />
                <Text style={styles.imInLabel}>I'm in</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}

      {firstMessagePrompt && (
        <FirstMessageModal
          visible={!!firstMessagePrompt}
          activityTitle={firstMessagePrompt.activityTitle}
          posterName={firstMessagePrompt.posterName}
          onSkip={() => {
            setFirstMessagePrompt(null);
            navigation.goBack();
          }}
          onSubmit={handleFirstMessageSubmit}
        />
      )}

      <ReportSheet
        visible={reportOpen}
        reportedUserId={activity.user_id}
        reportedUserName={poster?.first_name ?? "the host"}
        reportedContentType="activity"
        reportedContentId={activity.id}
        source="activity_detail"
        onClose={() => setReportOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.subtle },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.neutral.slate },
  scroll: { paddingBottom: 0 },

  // HERO — full-bleed
  heroWrap: {
    width: "100%",
    height: 380,
    overflow: "hidden",
    backgroundColor: colors.bg.subtle,
  },
  hero: { width: "100%", height: "100%" },
  heroChromeSafe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chromeBtn: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sm,
  },
  heroBottom: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontFamily: fonts.heading,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: -0.6,
  },

  // WHEN / WHERE tiles
  tileRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.neutral.cloud,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  tileLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tileLabel: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 1.1,
    color: colors.fg.secondary,
  },
  tileMain: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 17,
    color: colors.neutral.charcoal,
    letterSpacing: -0.3,
  },
  tileSub: {
    fontSize: 12.5,
    color: colors.fg.secondary,
  },

  // BODY blocks
  bodyBlock: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  descText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.neutral.charcoal,
  },
  // Add-to-calendar pill — white bg, hairline purple border, used when
  // the viewer has an active match for this activity.
  calendarPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.primary.wannaPurple,
    backgroundColor: "#FFFFFF",
  },
  calendarPillLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary.wannaPurple,
  },

  // POSTED BY
  posterCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    ...shadows.sm,
  },
  posterEyebrow: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 11,
    color: colors.fg.secondary,
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  posterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  posterTextCol: { flex: 1 },
  posterNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  posterName: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 16,
    color: colors.neutral.charcoal,
  },

  // FOOTER
  bottomSafe: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  ownerFooter: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: colors.primary.wannaPurple,
    backgroundColor: "#FFFFFF",
  },
  editLabel: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: "700",
    color: colors.primary.wannaPurple,
  },
  swipeFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  passDisc: {
    width: 56,
    height: 56,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  imInBtnOuter: {
    flex: 1,
    borderRadius: 9999,
    overflow: "hidden",
    ...shadows.brand,
  },
  imInBtn: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  imInLabel: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
