import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
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
 * Activity card detail. Two presentation modes branched on ownership:
 *
 *   - Owner viewing their own activity → "Edit activity" CTA at the
 *     bottom (read-only fields above; edit screen is on the roadmap).
 *   - Non-owner → "I'm in" / Pass swipe affordance just like the
 *     Discover deck, plus a "Posted by …" host card. After swiping
 *     right we open the same FirstMessageModal Discover uses so the
 *     interested user can attach a one-line note.
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
      // If we're not the owner, fetch the poster's mini-profile so we
      // can show a "Posted by [name]" card. Skipped for own activity.
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
        // Check for an existing swipe so we can hide the I'm-in
        // affordance on cards the user has already passed/liked.
        const { data: prev } = await supabase
          .from("swipes")
          .select("id, direction")
          .eq("swiper_id", user.id)
          .eq("activity_id", data.id)
          .maybeSingle();
        if (!cancelled && prev) setAlreadyExpressed(true);
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
      // We don't know the swiper's current Discover mode here — it's
      // not in scope on this screen. Leave NULL; the column is
      // nullable. The mode is still recorded for swipes that come
      // through the Discover deck.
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

    // Fire-and-forget push + email to the poster (mirrors Discover).
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

  const formattedDate = activity?.activity_date
    ? new Date(activity.activity_date + "T00:00:00").toLocaleDateString(
        undefined,
        { weekday: "long", month: "short", day: "numeric" }
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Icon
            name="CaretLeft"
            size={22}
            color={colors.neutral.charcoal}
            weight="bold"
          />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Activity</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary.wannaPurple} />
        </View>
      ) : !activity ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Activity not found.</Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
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
            </View>

            <View style={styles.body}>
              <Text style={styles.title}>{activity.title}</Text>

              <View style={styles.chipRow}>
                <CategoryPill category={activity.category} />
                {activity.intents.map((mode) => (
                  <View key={mode} style={styles.intentChip}>
                    <Text style={styles.intentChipText}>{mode}</Text>
                  </View>
                ))}
              </View>

              {(activity.location_name || formattedDate) && (
                <View style={styles.metaCard}>
                  {activity.location_name && (
                    <View style={styles.metaRow}>
                      <Icon
                        name="MapPin"
                        size={16}
                        color={colors.primary.wannaPurple}
                        weight="bold"
                      />
                      <Text style={styles.metaText}>{activity.location_name}</Text>
                    </View>
                  )}
                  {formattedDate && (
                    <View style={styles.metaRow}>
                      <Icon
                        name="CalendarBlank"
                        size={16}
                        color={colors.primary.wannaPurple}
                        weight="bold"
                      />
                      <Text style={styles.metaText}>{formattedDate}</Text>
                    </View>
                  )}
                </View>
              )}

              {activity.description ? (
                <Text style={styles.descText}>{activity.description}</Text>
              ) : null}

              {activity.link ? (
                <Pressable
                  style={styles.linkRow}
                  onPress={() => Linking.openURL(activity.link as string)}
                >
                  <Text style={styles.linkText} numberOfLines={1}>
                    {activity.link}
                  </Text>
                </Pressable>
              ) : null}

              {/* Posted by — only shown to non-owners. Tappable so the
                  user can jump straight to the host's profile. */}
              {!isOwner && poster && (
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
              )}
            </View>
          </ScrollView>

          {/* Footer: owner = Edit; non-owner = Pass + I'm in. Hidden if
              the user already swiped on this card from elsewhere. */}
          {isOwner ? (
            <View style={styles.footer}>
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
          ) : !alreadyExpressed ? (
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
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.subtle },
  header: {
    flexDirection: "row",
    alignItems: "center",
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.neutral.slate },
  scroll: { paddingBottom: 120 },
  heroWrap: {
    width: "100%",
    height: 280,
    overflow: "hidden",
    backgroundColor: colors.bg.subtle,
  },
  hero: { width: "100%", height: "100%" },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 24,
    color: colors.neutral.charcoal,
    letterSpacing: -0.4,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  intentChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: "rgba(140,82,255,0.1)",
  },
  intentChipText: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary.wannaPurple,
    textTransform: "capitalize",
  },
  metaCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    gap: 10,
    ...shadows.sm,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  metaText: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    fontWeight: "600",
    flex: 1,
  },
  descText: {
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.neutral.charcoal,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    ...shadows.sm,
  },
  linkText: {
    flex: 1,
    fontSize: 13,
    color: colors.primary.wannaPurple,
    fontWeight: "600",
  },
  // Posted-by host card (non-owner only)
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
  // Owner footer
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: colors.bg.subtle,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: colors.primary.wannaPurple,
    backgroundColor: "#FFFFFF",
  },
  editLabel: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary.wannaPurple,
  },
  // Non-owner footer (mirrors Discover swipe affordance)
  swipeFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
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
