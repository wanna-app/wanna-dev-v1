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

export function ProfileScreen({ navigation }: { navigation: any }) {
  const { profile, refreshProfile, signOut } = useAuth();
  const [photoUrls, setPhotoUrls] = useState<(string | null)[]>([]);

  useEffect(() => {
    if (!profile) return;
    Promise.all(profile.photos.map(resolveProfilePhotoUrl)).then(setPhotoUrls);
  }, [profile?.photos]);

  useFocusEffect(
    React.useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
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

        {/* INTERESTS — rainbow pills sorted A→Z for predictable scanning */}
        {profile.activity_preferences.length > 0 && (
          <Section title="Interests">
            <View style={styles.pillsRow}>
              {[...profile.activity_preferences]
                .sort((a, b) => a.localeCompare(b))
                .map((label) => {
                // Each chip uses the category's signature middle gradient
                // stop as its background color.
                const bg = pillColor(label);
                const iconName = interestIcon(label);
                return (
                  <View
                    key={label}
                    style={[styles.interestPill, { backgroundColor: bg }]}
                  >
                    <Icon name={iconName} size={14} color="#FFFFFF" weight="bold" />
                    <Text style={styles.interestPillText}>{label}</Text>
                  </View>
                );
              })}
            </View>
          </Section>
        )}

        {/* A BIT MORE — colored pills (one per filled optional field).
            Tappable to open Edit Profile so users can correct values. */}
        {optionalFields.length > 0 && (
          <Section title="A bit more">
            <View style={styles.pillsRow}>
              {optionalFields.map((f) => (
                <Pressable
                  key={f.label}
                  onPress={() => navigation.navigate("EditProfile")}
                  style={[
                    styles.factPill,
                    { backgroundColor: f.color },
                  ]}
                >
                  <Icon
                    name={f.iconName}
                    size={13}
                    color="#FFFFFF"
                    weight="bold"
                  />
                  <Text style={styles.factPillText}>
                    {f.label} · {f.value}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Section>
        )}

        {/* "Who I want to meet" + "Settings" sections were removed —
            those live in the gear icon (top-right) instead. */}

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
    paddingTop: spacing.sm,
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
    top: 102,
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
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 13.5,
    color: colors.neutral.charcoal,
  },

  // INTERESTS — colored pills
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
    ...shadows.sm,
  },
  interestPillText: {
    color: "#FFFFFF",
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 12,
  },

  // A BIT MORE — colored pills
  factPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9999,
    ...shadows.sm,
  },
  factPillText: {
    color: "#FFFFFF",
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 12,
  },

});
