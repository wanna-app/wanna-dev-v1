import React, { useEffect, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, IconName } from "../../components/Icon";
import { PhotoCarousel } from "../../components/PhotoCarousel";
import { ReportSheet } from "../../components/ReportSheet";
import { supabase } from "../../lib/supabase";
import { resolveProfilePhotoUrl } from "../../lib/storage";
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

interface RouteParams {
  userId: string;
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
  const { userId } = route.params as RouteParams;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photoUrls, setPhotoUrls] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

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
        .select("id")
        .eq("status", "active")
        .or(
          `and(poster_id.eq.${me.id},interested_id.eq.${userId}),` +
          `and(poster_id.eq.${userId},interested_id.eq.${me.id})`
        )
        .maybeSingle();
      if (!cancelled) setActiveMatchId(data?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const confirmAndUnmatch = () => {
    if (!activeMatchId) return;
    Alert.alert(
      "Unmatch?",
      `${profile?.first_name ?? "This user"} won't be able to message you. Existing chats become read-only.`,
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

  const openMenu = () => {
    const options = ["Report", "Block"];
    if (activeMatchId) options.unshift("Unmatch");
    options.push("Cancel");
    const cancelButtonIndex = options.length - 1;
    const destructiveButtonIndex = options.indexOf("Block");

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          destructiveButtonIndex,
          userInterfaceStyle: "light",
        },
        (idx) => {
          const choice = options[idx];
          if (choice === "Report") setReportOpen(true);
          else if (choice === "Unmatch") confirmAndUnmatch();
          else if (choice === "Block") confirmAndBlock();
        }
      );
    } else {
      // Android fallback — Alert with explicit buttons (skip Cancel)
      Alert.alert(profile?.first_name ?? "Profile", "Choose an action:", [
        ...(activeMatchId
          ? [
              {
                text: "Unmatch",
                style: "destructive" as const,
                onPress: confirmAndUnmatch,
              },
            ]
          : []),
        { text: "Report", onPress: () => setReportOpen(true) },
        {
          text: "Block",
          style: "destructive" as const,
          onPress: confirmAndBlock,
        },
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  };

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
        contentContainerStyle={styles.scroll}
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
                      size={16}
                      color={f.color}
                      weight="bold"
                    />
                  </View>
                  <Text style={styles.infoLabel}>{f.label}</Text>
                  <Text style={styles.infoValue}>{f.value}</Text>
                </View>
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
    paddingTop: spacing.sm,
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
    fontWeight: "700",
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
    fontWeight: "700",
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
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  infoIconBox: {
    width: 22,
    alignItems: "center",
  },
  infoLabel: {
    flex: 1,
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 14,
    color: colors.neutral.charcoal,
  },
  infoValue: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 14,
    color: colors.fg.secondary,
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
});
