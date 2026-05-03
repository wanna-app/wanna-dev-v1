import React, { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { Icon, IconName } from "../../components/Icon";
import { PhotoCarousel } from "../../components/PhotoCarousel";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { resolveProfilePhotoUrl } from "../../lib/storage";
import {
  colors,
  interestColors,
  spacing,
  borderRadius,
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

// Maps a stored activity_preferences label to its rainbow color (see
// theme/interestColors). Match is case-insensitive prefix so 'Music'
// resolves to 'Music & Concerts'.
function pillColor(label: string): string {
  const found = Object.keys(interestColors).find((key) =>
    key.toLowerCase().startsWith(label.toLowerCase())
  );
  if (found) return interestColors[found];
  return colors.primary.wannaPurple;
}

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

function interestIcon(label: string): IconName {
  // Match by first word
  const first = label.split(" ")[0];
  return INTEREST_ICON[first] ?? "Sparkle";
}

type ActiveActivityRow = {
  id: string;
  title: string;
  category: string | null;
  photo_url: string | null;
  activity_date: string | null;
  location_name: string | null;
  /** When the activity has an active match, this carries the other
   *  party's mini-profile so the row can render "Going with X" with
   *  a tap-out link to their UserProfileScreen. NULL when the
   *  activity is still open. */
  matched_user?: {
    id: string;
    first_name: string;
    photo: string | null;
  } | null;
};

export function ProfileScreen({ navigation }: { navigation: any }) {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [photoUrls, setPhotoUrls] = useState<(string | null)[]>([]);
  const [activeActivities, setActiveActivities] = useState<ActiveActivityRow[]>([]);

  useEffect(() => {
    if (!profile) return;
    Promise.all(profile.photos.map(resolveProfilePhotoUrl)).then(setPhotoUrls);
  }, [profile?.photos]);

  // Refetch on focus so newly-posted/expired activities reflect
  // immediately. We also pull active matches in parallel so we can
  // render "Going with X" on rows that have already paired up.
  useFocusEffect(
    React.useCallback(() => {
      refreshProfile();
      if (!user?.id) return;
      let cancelled = false;
      (async () => {
        const [{ data: actData }, { data: matchData }] = await Promise.all([
          supabase
            .from("activities")
            .select(
              "id, title, category, photo_url, activity_date, location_name"
            )
            .eq("user_id", user.id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("matches")
            .select(
              "activity_id, interested:profiles!matches_interested_id_fkey(id, first_name, photos)"
            )
            .eq("poster_id", user.id)
            .eq("status", "active"),
        ]);
        if (cancelled || !actData) return;
        // Build lookup: activity_id → matched user mini-profile
        const byActivity = new Map<
          string,
          { id: string; first_name: string; photo: string | null }
        >();
        (matchData ?? []).forEach((row: any) => {
          const u = Array.isArray(row.interested)
            ? row.interested[0]
            : row.interested;
          if (!u) return;
          byActivity.set(row.activity_id, {
            id: u.id,
            first_name: u.first_name,
            photo: u.photos?.[0] ?? null,
          });
        });
        const rows: ActiveActivityRow[] = (actData as any[]).map((a) => ({
          ...a,
          matched_user: byActivity.get(a.id) ?? null,
        }));
        setActiveActivities(rows);
      })();
      return () => {
        cancelled = true;
      };
    }, [refreshProfile, user?.id])
  );

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.empty}>Loading profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const age = profile.date_of_birth
    ? Math.floor(
        (Date.now() - new Date(profile.date_of_birth).getTime()) /
          (1000 * 60 * 60 * 24 * 365.25)
      )
    : null;

  // 'A bit more' chips — colored pills (one per filled optional field).
  // Each pill shows "<Label> · <value>" with a category-colored background.
  const optionalFields = [
    profile.political_orientation && {
      iconName: "Scales" as IconName,
      label: "Politics",
      value: POLITICAL_LABEL[profile.political_orientation],
      color: interestColors["Movies & Shows"], // deep violet
    },
    profile.star_sign && {
      iconName: "Star" as IconName,
      label: "Star sign",
      value: profile.star_sign,
      color: interestColors["Music & Concerts"], // brand purple
    },
    profile.alcohol && {
      iconName: "BeerBottle" as IconName,
      label: "Alcohol",
      value: FREQUENCY_LABEL[profile.alcohol],
      color: interestColors["Bars & Nightlife"], // coral
    },
    profile.marijuana && {
      iconName: "Leaf" as IconName,
      label: "Marijuana",
      value: FREQUENCY_LABEL[profile.marijuana],
      color: interestColors["Outdoors & Adventure"], // green
    },
  ].filter(Boolean) as Array<{
    iconName: IconName;
    label: string;
    value: string;
    color: string;
  }>;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* HERO PHOTO — full-bleed carousel (tap left/right to cycle) */}
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

              {/* Top chrome — Edit + Settings */}
              <SafeAreaView edges={["top"]} style={styles.topChromeSafe}>
                <Pressable
                  style={styles.editPill}
                  onPress={() => navigation.navigate("EditProfile")}
                  hitSlop={6}
                >
                  <Icon
                    name="PencilSimple"
                    size={14}
                    color={colors.neutral.charcoal}
                    weight="bold"
                  />
                  <Text style={styles.editPillText}>Edit profile</Text>
                </Pressable>
                <Pressable
                  style={styles.chromeBtn}
                  onPress={() => navigation.navigate("Settings")}
                  hitSlop={6}
                >
                  <Icon
                    name="GearSix"
                    size={18}
                    color={colors.neutral.charcoal}
                    weight="bold"
                  />
                </Pressable>
              </SafeAreaView>

              {/* Name block over photo (non-interactive — taps pass through
                  to the carousel's left/right zones) */}
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
                    <InfoLine iconName="Briefcase" label={profile.profession} />
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

        {/* INTERESTS — white pills with rainbow-colored icons, sorted A→Z */}
        {profile.activity_preferences.length > 0 && (
          <Section title="Interests">
            <View style={styles.pillsRow}>
              {[...profile.activity_preferences]
                .sort((a, b) => a.localeCompare(b))
                .map((label) => {
                  const iconColor = pillColor(label);
                  const iconName = interestIcon(label);
                  return (
                    <View key={label} style={styles.interestPill}>
                      <Icon
                        name={iconName}
                        size={14}
                        color={iconColor}
                        weight="bold"
                      />
                      <Text style={styles.interestPillText}>{label}</Text>
                    </View>
                  );
                })}
            </View>
          </Section>
        )}

        {/* MORE INFO — white rounded table with one row per filled
            optional field. Each row is tappable → Edit Profile. */}
        {optionalFields.length > 0 && (
          <Section title="More info">
            <View style={styles.infoTable}>
              {optionalFields.map((f, idx) => (
                <Pressable
                  key={f.label}
                  onPress={() => navigation.navigate("EditProfile")}
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
                </Pressable>
              ))}
            </View>
          </Section>
        )}

        {/* "Who I want to meet" + "Settings" sections were removed —
            those live in the gear icon (top-right) instead. */}

        {/* ACTIVE ACTIVITIES — viewer's own currently-active posts.
            Hidden when there are none (no empty heading). */}
        {activeActivities.length > 0 && (
          <Section title="My activities">
            <View style={styles.infoTable}>
              {activeActivities.map((a, idx) => (
                <ActivityRow
                  key={a.id}
                  row={a}
                  isLast={idx === activeActivities.length - 1}
                  onPress={() =>
                    navigation.navigate("ActivityDetail", { activityId: a.id })
                  }
                  onTapMatchedUser={(uid) =>
                    navigation.navigate("UserProfile", { userId: uid })
                  }
                />
              ))}
            </View>
          </Section>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

// ─── Local helpers ───────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ActivityRow({
  row,
  isLast,
  onPress,
  onTapMatchedUser,
}: {
  row: ActiveActivityRow;
  isLast: boolean;
  onPress: () => void;
  /** Optional handler invoked when the user taps the "Going with X"
   *  pill — pops UserProfileScreen for the matched party. */
  onTapMatchedUser?: (userId: string) => void;
}) {
  const matched = row.matched_user;
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
        {/* If the activity has paired up, show "Going with X" as a
            tappable purple chip. Otherwise show the date/location
            secondary line. */}
        {matched ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onTapMatchedUser?.(matched.id);
            }}
            style={styles.goingWithChip}
            hitSlop={4}
          >
            <Icon
              name="HandWaving"
              size={11}
              color={colors.primary.wannaPurple}
              weight="fill"
            />
            <Text style={styles.goingWithText}>
              Going with {matched.first_name}
            </Text>
          </Pressable>
        ) : (
          (() => {
            const date = row.activity_date
              ? new Date(row.activity_date + "T00:00:00").toLocaleDateString(
                  undefined,
                  { month: "short", day: "numeric" }
                )
              : null;
            const parts = [date, row.location_name].filter(
              Boolean
            ) as string[];
            if (parts.length === 0) return null;
            return (
              <Text style={styles.activityMeta} numberOfLines={1}>
                {parts.join(" · ")}
              </Text>
            );
          })()
        )}
      </View>
    </Pressable>
  );
}

function InfoLine({ iconName, label }: { iconName: IconName; label: string }) {
  return (
    <View style={styles.infoLine}>
      <View style={styles.infoLineIcon}>
        <Icon name={iconName} size={16} color={colors.primary.wannaPurple} weight="bold" />
      </View>
      <Text style={styles.infoLineLabel}>{label}</Text>
    </View>
  );
}


const HERO_HEIGHT = 460;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.subtle },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.neutral.slate },
  scroll: { paddingBottom: spacing.lg },

  // HERO
  heroWrapper: {
    height: HERO_HEIGHT,
    width: "100%",
    position: "relative",
    backgroundColor: colors.primary.deepViolet,
  },
  heroPhoto: { width: "100%", height: "100%" },
  topChromeSafe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    // Sits a hair below the carousel dot bars (PhotoCarousel renders
    // dots at top:54). 18pt past the safe-area inset puts chrome at
    // ~68pt, ~11pt below the bars.
    paddingTop: 18,
    zIndex: 5,
  },
  editPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.92)",
    ...shadows.sm,
  },
  editPillText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: "700",
    color: colors.neutral.charcoal,
  },
  chromeBtn: {
    width: 38,
    height: 38,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sm,
  },
  photoDots: {
    position: "absolute",
    // Sits below the top chrome (edit pill + gear) so the bars don't
    // collide with the buttons.
    top: 118,
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    gap: 4,
    zIndex: 4,
  },
  photoDot: {
    flex: 1,
    height: 3,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  photoDotActive: { backgroundColor: "#FFFFFF" },
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
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  subtitleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  subtitleText: {
    fontFamily: fonts.heading,
    fontWeight: "600",
    fontSize: 13,
    color: "rgba(255,255,255,0.95)",
  },

  // SECTION
  section: {
    paddingHorizontal: spacing.md,
    paddingTop: 22,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 11,
    color: colors.fg.secondary,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  sectionSubtitle: {
    fontSize: 11,
    color: colors.neutral.slate,
    fontStyle: "italic",
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
  aboutDetails: {
    gap: 8,
    marginTop: 14,
  },
  aboutDetailsWithBorder: {
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  infoLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoLineIcon: { width: 18 },
  infoLineLabel: {
    // Use the body font (Helvetica) instead of the rounded display
    // font here — the rounded face was reading bold even at 500
    // weight, which made the About card look cluttered with
    // "Profession" + "University" + values all shouting.
    fontFamily: fonts.body,
    fontWeight: "400",
    fontSize: 14,
    color: colors.neutral.charcoal,
  },

  // INTERESTS — white pills with rainbow-colored icons
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
  // Fixed-width label so all values land at the same x — the table
  // reads as a tidy two-column grid rather than a ragged list.
  infoLabel: {
    width: 96,
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 13.5,
    color: colors.neutral.charcoal,
  },
  infoValue: {
    flex: 1,
    fontFamily: fonts.body,
    fontWeight: "400",
    fontSize: 12.5,
    color: colors.fg.secondary,
  },

  // ACTIVE ACTIVITIES — rows inside the same white rounded `infoTable`
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
  activityMeta: {
    fontFamily: fonts.heading,
    fontWeight: "500",
    fontSize: 11.5,
    color: colors.neutral.slate,
  },
  // "Going with X" chip — surfaces who paired up on a matched
  // activity. Tappable → pops the matched user's profile.
  goingWithChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    backgroundColor: "rgba(140,82,255,0.10)",
    marginTop: 2,
  },
  goingWithText: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 11,
    color: colors.primary.wannaPurple,
  },
});
