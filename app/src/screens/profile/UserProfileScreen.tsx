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
import { ActionMenu, ActionMenuItem } from "../../components/ActionMenu";
import { Icon, IconName } from "../../components/Icon";
import { MatchModal } from "../../components/MatchModal";
import { PhotoCarousel } from "../../components/PhotoCarousel";
import { ReportSheet } from "../../components/ReportSheet";
import { supabase } from "../../lib/supabase";
import { resolveProfilePhotoUrl } from "../../lib/storage";
import { sendPush } from "../../lib/push";
import { sendMatchEmail } from "../../lib/email";
import { track } from "../../lib/analytics";
import { useAuth } from "../../hooks/useAuth";
import type { Profile } from "../../types/database";
import {
  colors,
  interestColors,
  spacing,
  fontSizes,
  fonts,
  shadows,
} from "../../theme";

const FREQUENCY_LABEL: Record<string, string> = {
  never: "Never",
  rarely: "Rarely",
  sometimes: "Sometimes",
  often: "Often",
};

const POLITICAL_LABEL: Record<string, string> = {
  liberal: "Liberal",
  moderate: "Moderate",
  conservative: "Conservative",
};

const INTEREST_ICON: Record<string, IconName> = {
  Music: "MusicNotes",
  Outdoors: "Mountains",
  Fitness: "TennisBall",
  Food: "ForkKnife",
  Arts: "Palette",
  Bars: "Martini",
  Books: "BookOpen",
  Movies: "FilmStrip",
  Gaming: "GameController",
  Other: "Sparkle",
};

function pillColor(label: string): string {
  const found = Object.keys(interestColors).find((key) =>
    key.toLowerCase().startsWith(label.toLowerCase())
  );
  if (found) return interestColors[found];
  return colors.primary.wannaPurple;
}

function interestIcon(label: string): IconName {
  const first = label.split(" ")[0];
  return INTEREST_ICON[first] ?? "Sparkle";
}

type ActiveActivityRow = {
  id: string;
  title: string;
  category: string | null;
  photo_url: string | null;
};

type QueueContext = {
  queueId: string;
  activityId: string;
  activityTitle: string;
  posterFirstName: string;
  posterPhoto: string | null;
  posterIsVerified: boolean;
};

interface RouteParams {
  userId: string;
  queueContext?: QueueContext;
}

/**
 * Read-only view of another user's profile. Mirrors the visual structure
 * of ProfileScreen 1:1 — same hero, About card, rainbow interest pills,
 * 'A bit more' colored pills. Differences:
 *   - Top chrome: Back button + dots-menu (Report) instead of Edit/Settings
 *   - No 'Who I want to meet' or 'Settings' sections (those are private)
 *   - Photo carousel cycles via tap-left/tap-right halves
 */
export function UserProfileScreen({ navigation, route }: any) {
  const { userId, queueContext } = route.params as RouteParams;
  const { user: authUser, profile: viewerProfile } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photoUrls, setPhotoUrls] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeMatchActivityTitle, setActiveMatchActivityTitle] = useState<string | null>(null);
  const [queueActivityPhotoUrl, setQueueActivityPhotoUrl] = useState<string | null>(null);
  const [matchedInfo, setMatchedInfo] = useState<{
    name: string;
    photo: string | null;
    userId: string;
    verified: boolean;
    matchId: string;
  } | null>(null);
  const [queueActionPending, setQueueActionPending] = useState(false);
  const [activeActivities, setActiveActivities] = useState<ActiveActivityRow[]>([]);

  // Fetch this user's currently-active posted activities. RLS already
  // permits reading active rows.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("activities")
      .select("id, title, category, photo_url")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!cancelled && data) setActiveActivities(data as ActiveActivityRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Pre-fetch the activity hero photo once when in queue-review mode so
  // the celebration MatchModal can use it.
  useEffect(() => {
    if (!queueContext) return;
    let cancelled = false;
    supabase
      .from("activities")
      .select("photo_url")
      .eq("id", queueContext.activityId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.photo_url) {
          setQueueActivityPhotoUrl(data.photo_url);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [queueContext]);

  const handleQueuePass = async () => {
    if (!queueContext || queueActionPending) return;
    setQueueActionPending(true);
    const { error } = await supabase.rpc("reject_interest", {
      p_queue_id: queueContext.queueId,
    });
    setQueueActionPending(false);
    if (error) {
      Alert.alert("Couldn't pass", error.message);
      return;
    }
    track("interest_rejected", {
      activity_id: queueContext.activityId,
      interested_user_id: userId,
    });
    navigation.goBack();
  };

  const handleQueueAccept = async () => {
    if (!queueContext || !profile || queueActionPending) return;
    setQueueActionPending(true);
    const { data: newMatchId, error } = await supabase.rpc("accept_interest", {
      p_queue_id: queueContext.queueId,
    });
    setQueueActionPending(false);
    if (error) {
      Alert.alert("Couldn't match", error.message);
      return;
    }

    track("interest_accepted", {
      match_id: newMatchId,
      activity_id: queueContext.activityId,
      interested_user_id: userId,
    });
    track("queue_locked", {
      activity_id: queueContext.activityId,
      match_id: newMatchId,
    });

    setMatchedInfo({
      name: profile.first_name,
      photo: photoUrls[0] ?? null,
      userId,
      verified: profile.is_verified ?? false,
      matchId: newMatchId as string,
    });
    track("match_modal_shown", { match_id: newMatchId, action_taken: null });

    // Fire-and-forget push + email to both parties (mirrors WhosInQueueScreen).
    if (authUser && viewerProfile && newMatchId) {
      sendPush({
        type: "match",
        match_id: newMatchId as string,
        poster_id: authUser.id,
        interested_id: userId,
        poster_name: viewerProfile.first_name,
        interested_name: profile.first_name,
        activity_title: queueContext.activityTitle,
      }).catch(() => {});

      sendMatchEmail({
        recipient_id: authUser.id,
        match_id: newMatchId as string,
      }).catch(() => {});
      sendMatchEmail({
        recipient_id: userId,
        match_id: newMatchId as string,
      }).catch(() => {});
    }
  };

  // Look up an active match between the viewer and this user so the
  // dots-menu can offer "Unmatch". If there's no active match, the
  // option is hidden.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user: me } } = await supabase.auth.getUser();
      if (!me || cancelled) return;
      const { data } = await supabase
        .from("matches")
        .select("id, activities(title)")
        .eq("status", "active")
        .or(
          `and(poster_id.eq.${me.id},interested_id.eq.${userId}),` +
          `and(poster_id.eq.${userId},interested_id.eq.${me.id})`
        )
        .maybeSingle();
      if (!cancelled) {
        setActiveMatchId(data?.id ?? null);
        // activities() may come back as an object or array depending on
        // the relationship inference — handle both shapes.
        const act = (data as any)?.activities;
        const title = Array.isArray(act) ? act[0]?.title : act?.title;
        setActiveMatchActivityTitle(title ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const confirmAndUnmatch = () => {
    if (!activeMatchId) return;
    const name = profile?.first_name ?? "this user";
    const titlePart = activeMatchActivityTitle
      ? ` for ${activeMatchActivityTitle}`
      : "";
    Alert.alert(
      "Unmatch?",
      `Are you sure you want to unmatch ${name}${titlePart}? Your chat will close and you will no longer be able to message them.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unmatch",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("unmatch", {
              p_match_id: activeMatchId,
            });
            if (error) {
              Alert.alert("Couldn't unmatch", error.message);
              return;
            }
            setActiveMatchId(null);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const confirmAndBlock = () => {
    if (!profile) return;
    Alert.alert(
      `Block ${profile.first_name}?`,
      "You won't see each other's profiles or activities anywhere on Wanna. Existing chats stay read-only.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            const { data: { user: me } } = await supabase.auth.getUser();
            if (!me) return;
            const { error } = await supabase.from("blocks").insert({
              blocker_id: me.id,
              blocked_user_id: userId,
            });
            if (error) {
              Alert.alert("Couldn't block", error.message);
              return;
            }
            navigation.goBack();
          },
        },
      ]
    );
  };

  const openMenu = () => setMenuOpen(true);

  const menuItems: ActionMenuItem[] = [
    ...(activeMatchId
      ? [
          {
            label: "Unmatch",
            destructive: true,
            onPress: confirmAndUnmatch,
          },
        ]
      : []),
    { label: "Report", onPress: () => setReportOpen(true) },
    {
      label: "Block",
      destructive: true,
      onPress: confirmAndBlock,
    },
  ];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setProfile(data as Profile);
      const urls = await Promise.all(
        (data.photos as string[]).map(resolveProfilePhotoUrl)
      );
      if (!cancelled) {
        setPhotoUrls(urls);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary.wannaPurple} />
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.empty}>Profile not found.</Text>
        </View>
      </View>
    );
  }

  const age = profile.date_of_birth
    ? Math.floor(
        (Date.now() - new Date(profile.date_of_birth).getTime()) /
          (1000 * 60 * 60 * 24 * 365.25)
      )
    : null;

  const optionalFields = [
    profile.political_orientation && {
      iconName: "Scales" as IconName,
      label: "Politics",
      value: POLITICAL_LABEL[profile.political_orientation],
      color: interestColors["Movies & Shows"],
    },
    profile.star_sign && {
      iconName: "Star" as IconName,
      label: "Star sign",
      value: profile.star_sign,
      color: interestColors["Music & Concerts"],
    },
    profile.alcohol && {
      iconName: "BeerBottle" as IconName,
      label: "Alcohol",
      value: FREQUENCY_LABEL[profile.alcohol],
      color: interestColors["Bars & Nightlife"],
    },
    profile.marijuana && {
      iconName: "Leaf" as IconName,
      label: "Marijuana",
      value: FREQUENCY_LABEL[profile.marijuana],
      color: interestColors["Outdoors & Adventure"],
    },
  ].filter(Boolean) as Array<{
    iconName: IconName;
    label: string;
    value: string;
    color: string;
  }>;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          queueContext ? { paddingBottom: 96 } : undefined,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO PHOTO CAROUSEL */}
        <PhotoCarousel
          urls={photoUrls}
          height={460}
          overlay={
            <>
              {/* Top scrim */}
              <LinearGradient
                colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)"]}
                locations={[0, 0.5]}
                style={[StyleSheet.absoluteFill, { height: 180 }]}
                pointerEvents="none"
              />
              {/* Bottom scrim */}
              <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.7)"]}
                locations={[0.45, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              {/* Top chrome — Back + Report (dots) */}
              <SafeAreaView edges={["top"]} style={styles.topChromeSafe}>
                <Pressable
                  onPress={() => navigation.goBack()}
                  style={styles.chromeBtn}
                  hitSlop={6}
                >
                  <Icon
                    name="CaretLeft"
                    size={20}
                    color={colors.neutral.charcoal}
                    weight="bold"
                  />
                </Pressable>
                <Pressable
                  onPress={openMenu}
                  style={styles.chromeBtn}
                  hitSlop={6}
                >
                  <Icon
                    name="DotsThree"
                    size={20}
                    color={colors.neutral.charcoal}
                    weight="bold"
                  />
                </Pressable>
              </SafeAreaView>

              {/* Name overlay — same treatment as ProfileScreen */}
              <View style={styles.nameOverlay} pointerEvents="none">
                <View style={styles.nameRow}>
                  <Text style={styles.heroName}>
                    {profile.first_name}
                    {age !== null ? `, ${age}` : ""}
                  </Text>
                  {profile.is_verified && (
                    <Icon
                      name="SealCheck"
                      size={26}
                      color="#FFFFFF"
                      weight="fill"
                    />
                  )}
                </View>
              </View>
            </>
          }
        />

        {/* ABOUT — bio + profession + university */}
        {(profile.bio || profile.profession || profile.university) && (
          <Section title="About">
            <View style={styles.aboutCard}>
              {profile.bio ? (
                <Text style={styles.bioText}>{profile.bio}</Text>
              ) : null}
              {(profile.profession || profile.university) && (
                <View
                  style={[
                    styles.aboutDetails,
                    profile.bio ? styles.aboutDetailsWithBorder : undefined,
                  ]}
                >
                  {profile.profession ? (
                    <InfoLine
                      iconName="Briefcase"
                      label={profile.profession}
                    />
                  ) : null}
                  {profile.university ? (
                    <InfoLine
                      iconName="GraduationCap"
                      label={profile.university}
                    />
                  ) : null}
                </View>
              )}
            </View>
          </Section>
        )}

        {/* INTERESTS — white pills with rainbow-colored icons, A→Z */}
        {profile.activity_preferences.length > 0 && (
          <Section title="Interests">
            <View style={styles.pillsRow}>
              {[...profile.activity_preferences]
                .sort((a, b) => a.localeCompare(b))
                .map((label) => (
                  <View key={label} style={styles.interestPill}>
                    <Icon
                      name={interestIcon(label)}
                      size={14}
                      color={pillColor(label)}
                      weight="bold"
                    />
                    <Text style={styles.interestPillText}>{label}</Text>
                  </View>
                ))}
            </View>
          </Section>
        )}

        {/* MORE INFO — white rounded table, one row per filled field */}
        {optionalFields.length > 0 && (
          <Section title="More info">
            <View style={styles.infoTable}>
              {optionalFields.map((f, idx) => (
                <View
                  key={f.label}
                  style={[
                    styles.infoRow,
                    idx < optionalFields.length - 1 && styles.infoRowDivider,
                  ]}
                >
                  <View style={styles.infoIconBox}>
                    <Icon
                      name={f.iconName}
                      size={15}
                      color={colors.primary.wannaPurple}
                      weight="bold"
                    />
                  </View>
                  <Text style={styles.infoLabel}>{f.label}</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>
                    {f.value}
                  </Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* ACTIVE ACTIVITIES — this user's currently-active posts.
            Hidden when there are none. */}
        {activeActivities.length > 0 && (
          <Section title={`${profile.first_name}'s active activities`}>
            <View style={styles.infoTable}>
              {activeActivities.map((a, idx) => (
                <ActivityRow
                  key={a.id}
                  row={a}
                  isLast={idx === activeActivities.length - 1}
                  onPress={() =>
                    navigation.navigate("ActivityDetail", { activityId: a.id })
                  }
                />
              ))}
            </View>
          </Section>
        )}

        {/* Bottom 'Report this user' link removed — Report is in the
            dots menu (top-right) along with Unmatch + Block. */}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      <ReportSheet
        visible={reportOpen}
        reportedUserId={profile.id}
        reportedUserName={profile.first_name}
        reportedContentType="profile"
        source="user_profile"
        onClose={() => setReportOpen(false)}
      />

      <ActionMenu
        visible={menuOpen}
        title={profile.first_name}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />

      {/* Sticky Pass / Go-with-X bar — only when reviewing a queue entry */}
      {queueContext && (
        <SafeAreaView edges={["bottom"]} style={styles.queueBarSafe}>
          <View style={styles.actions}>
            <Pressable style={styles.passBtn} onPress={handleQueuePass}>
              <Icon
                name="X"
                size={18}
                color={colors.neutral.charcoal}
                weight="bold"
              />
              <Text style={styles.passLabel}>Pass</Text>
            </Pressable>
            <Pressable style={styles.acceptBtnOuter} onPress={handleQueueAccept}>
              <LinearGradient
                colors={[colors.primary.wannaPurple, colors.secondary.wannaCyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.acceptBtn}
              >
                <Icon name="HandWaving" size={18} color="#FFFFFF" weight="fill" />
                <Text style={styles.acceptLabel}>
                  Go with {profile.first_name}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </SafeAreaView>
      )}

      {queueContext && (
        <MatchModal
          visible={!!matchedInfo}
          matchedName={matchedInfo?.name ?? ""}
          matchedPhoto={matchedInfo?.photo ?? null}
          activityPhotoUrl={queueActivityPhotoUrl}
          activityTitle={queueContext.activityTitle}
          yourName={viewerProfile?.first_name ?? "You"}
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
          onKeepBrowsing={() => {
            setMatchedInfo(null);
            navigation.goBack();
          }}
        />
      )}
    </View>
  );
}

// ─── Local helpers ───────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ActivityRow({
  row,
  isLast,
  onPress,
}: {
  row: ActiveActivityRow;
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.activityRow, !isLast && styles.infoRowDivider]}
    >
      {row.photo_url ? (
        <Image source={{ uri: row.photo_url }} style={styles.activityThumb} />
      ) : (
        <View style={[styles.activityThumb, styles.activityThumbFallback]} />
      )}
      <View style={styles.activityTextCol}>
        <Text style={styles.activityTitle} numberOfLines={1}>
          {row.title}
        </Text>
        {row.category ? (
          <Text style={styles.activityCategory} numberOfLines={1}>
            {row.category}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function InfoLine({ iconName, label }: { iconName: IconName; label: string }) {
  return (
    <View style={styles.infoLine}>
      <View style={styles.infoLineIcon}>
        <Icon
          name={iconName}
          size={16}
          color={colors.primary.wannaPurple}
          weight="bold"
        />
      </View>
      <Text style={styles.infoLineLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.subtle },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.neutral.slate },
  scroll: { paddingBottom: spacing.lg },

  // HERO chrome
  topChromeSafe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    // Sits BELOW the carousel dots (PhotoCarousel renders dots at
    // top:100). Safe-area inset (~50pt) + 80pt drops chrome below the
    // bars.
    paddingTop: 80,
    zIndex: 6,
  },
  chromeBtn: {
    width: 38,
    height: 38,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sm,
  },
  nameOverlay: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 22,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  heroName: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 32,
    letterSpacing: -0.6,
    lineHeight: 34,
    color: "#FFFFFF",
  },

  // SECTION
  section: {
    paddingHorizontal: spacing.md,
    paddingTop: 22,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 11,
    color: colors.fg.secondary,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  // ABOUT
  aboutCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    ...shadows.sm,
  },
  bioText: {
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.neutral.charcoal,
  },
  aboutDetails: { gap: 8, marginTop: 14 },
  aboutDetailsWithBorder: {
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  infoLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoLineIcon: { width: 18 },
  infoLineLabel: {
    fontFamily: fonts.heading,
    fontWeight: "500",
    fontSize: 13.5,
    color: colors.neutral.charcoal,
  },

  // PILLS — white background, color in the icon
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  interestPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: "#FFFFFF",
    ...shadows.sm,
  },
  interestPillText: {
    color: colors.neutral.charcoal,
    fontFamily: fonts.heading,
    fontWeight: "500",
    fontSize: 12,
  },

  // MORE INFO — white rounded table
  infoTable: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    ...shadows.sm,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  infoRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  infoIconBox: {
    width: 18,
    alignItems: "center",
  },
  // Fixed-width label so all values land at the same x — gives the
  // table a tidy two-column grid rather than a ragged list.
  infoLabel: {
    width: 96,
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 13.5,
    color: colors.neutral.charcoal,
  },
  infoValue: {
    flex: 1,
    fontFamily: fonts.heading,
    fontWeight: "500",
    fontSize: 13.5,
    color: colors.fg.secondary,
  },

  // ACTIVE ACTIVITIES — rows inside the white rounded `infoTable`
  // container used elsewhere on this screen, for visual consistency.
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  activityThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.bg.subtle,
  },
  activityThumbFallback: {
    backgroundColor: colors.primary.deepViolet,
  },
  activityTextCol: {
    flex: 1,
    gap: 2,
  },
  activityTitle: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 14.5,
    color: colors.neutral.charcoal,
  },
  activityCategory: {
    fontFamily: fonts.heading,
    fontWeight: "500",
    fontSize: 12.5,
    color: colors.neutral.slate,
  },

  reportLink: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
  },
  reportLinkText: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    fontWeight: "600",
  },

  // Sticky queue-action bar (Pass / Go-with-X) — only mounted when
  // queueContext is present in route.params.
  queueBarSafe: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  passBtn: {
    flex: 1,
    height: 52,
    borderRadius: 9999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    backgroundColor: "#FFFFFF",
  },
  passLabel: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: "700",
    color: colors.neutral.charcoal,
  },
  acceptBtnOuter: {
    flex: 1.4,
    borderRadius: 9999,
    overflow: "hidden",
    ...shadows.brand,
  },
  acceptBtn: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  acceptLabel: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
